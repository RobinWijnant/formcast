import { z } from 'zod';
import { FIELD_BY_KEY, GROUP_BY_KEY, type ColumnDef, type FieldDef } from './schema';

export type FieldValue = string | number | boolean | string[];
export type LineValues = Record<string, string | number>;

export interface FieldOp {
  op: 'set' | 'clear';
  fieldKey: string;
  value?: FieldValue;
}

export interface LineOp {
  op: 'create' | 'update' | 'delete';
  groupKey: string;
  /** DB id for update/delete, `tmp_<n>` for create. */
  lineId: string;
  values?: LineValues;
}

/** The full set of pending changes on top of the committed form. */
export interface ProposalSet {
  fieldOps: FieldOp[];
  lineOps: LineOp[];
}

export const EMPTY_PROPOSALS: ProposalSet = { fieldOps: [], lineOps: [] };

export const opKey = (op: FieldOp | LineOp): string =>
  'fieldKey' in op ? `field:${op.fieldKey}` : `line:${op.lineId}`;

// Loose shapes: what we accept from the model or a client before normalizing.
const rawFieldOp = z.object({
  op: z.string(),
  fieldKey: z.string(),
  value: z.unknown().optional(),
});
const rawLineOp = z.object({
  op: z.string(),
  groupKey: z.string(),
  lineId: z.string().optional().nullable(),
  values: z.record(z.string(), z.unknown()).optional().nullable(),
});
export const rawProposalSet = z.object({
  fieldOps: z.array(z.unknown()).default([]),
  lineOps: z.array(z.unknown()).default([]),
});

const TIME = /^(\d{1,2})[:.h](\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function matchOption(options: { value: string; label: string }[] | undefined, raw: unknown) {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return options?.find((o) => o.value === v || o.label.toLowerCase().replace(/\s+/g, '-') === v)?.value;
}

function toNumber(raw: unknown): number | undefined {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.').trim()) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** Coerces a raw value to the field's type. Returns undefined when it can't be applied. */
export function normalizeValue(def: Pick<FieldDef, 'type' | 'options'> | ColumnDef, raw: unknown): FieldValue | undefined {
  switch (def.type) {
    case 'text': {
      if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
      const s = String(raw).trim();
      return s.length ? s : undefined;
    }
    case 'number':
      return toNumber(raw);
    case 'time': {
      const m = typeof raw === 'string' ? TIME.exec(raw.trim()) : null;
      if (!m) return undefined;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h > 23 || min > 59) return undefined;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
    case 'date':
      return typeof raw === 'string' && DATE.test(raw.trim()) && !Number.isNaN(Date.parse(raw)) ? raw.trim() : undefined;
    case 'boolean':
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 'yes') return true;
      if (raw === 'false' || raw === 'no') return false;
      return undefined;
    case 'select':
      return matchOption(def.options, raw);
    case 'multiselect': {
      if (!Array.isArray(raw)) return undefined;
      const out: string[] = [];
      for (const r of raw) {
        const v = matchOption(def.options, r);
        if (v && !out.includes(v)) out.push(v);
      }
      return out;
    }
  }
}

export interface NormalizeContext {
  /** Ids of lines that exist in the database (update/delete targets). */
  committedLineIds: Set<string>;
}

export interface NormalizeResult {
  set: ProposalSet;
  /** Human readable reasons for ops that were dropped (logged, shown in dev). */
  dropped: string[];
}

/**
 * Validates an untrusted proposal set (from the LLM or a client) against the form schema.
 * Invalid ops are dropped, never applied. Later ops for the same target win.
 */
export function normalizeProposalSet(input: unknown, ctx: NormalizeContext): NormalizeResult {
  const dropped: string[] = [];
  const parsed = rawProposalSet.safeParse(input);
  if (!parsed.success) return { set: { fieldOps: [], lineOps: [] }, dropped: ['not a proposal set'] };

  const fields = new Map<string, FieldOp>();
  for (const item of parsed.data.fieldOps) {
    const r = rawFieldOp.safeParse(item);
    if (!r.success) { dropped.push('malformed field op'); continue; }
    const def = FIELD_BY_KEY.get(r.data.fieldKey);
    if (!def) { dropped.push(`unknown field ${r.data.fieldKey}`); continue; }
    if (r.data.op === 'clear') { fields.set(def.key, { op: 'clear', fieldKey: def.key }); continue; }
    if (r.data.op !== 'set') { dropped.push(`bad op ${r.data.op} on ${def.key}`); continue; }
    const value = normalizeValue(def, r.data.value);
    if (value === undefined) { dropped.push(`invalid value for ${def.key}: ${JSON.stringify(r.data.value)}`); continue; }
    fields.set(def.key, { op: 'set', fieldKey: def.key, value });
  }

  const lines = new Map<string, LineOp>();
  let tmpCounter = 0;
  for (const item of parsed.data.lineOps) {
    const r = rawLineOp.safeParse(item);
    if (!r.success) { dropped.push('malformed line op'); continue; }
    const group = GROUP_BY_KEY.get(r.data.groupKey);
    if (!group) { dropped.push(`unknown group ${r.data.groupKey}`); continue; }
    const op = r.data.op;
    const rawValues = r.data.values ?? {};

    if (op === 'delete') {
      if (!r.data.lineId || !ctx.committedLineIds.has(r.data.lineId)) { dropped.push(`delete of unknown line ${r.data.lineId}`); continue; }
      lines.set(r.data.lineId, { op: 'delete', groupKey: group.key, lineId: r.data.lineId });
      continue;
    }

    const values: LineValues = {};
    for (const col of group.columns) {
      if (!(col.key in rawValues) || rawValues[col.key] == null) continue;
      const v = normalizeValue(col, rawValues[col.key]);
      if (v === undefined || typeof v === 'boolean' || Array.isArray(v)) { dropped.push(`invalid ${group.key}.${col.key}`); continue; }
      values[col.key] = v;
    }

    if (op === 'update') {
      if (!r.data.lineId || !ctx.committedLineIds.has(r.data.lineId)) { dropped.push(`update of unknown line ${r.data.lineId}`); continue; }
      if (!Object.keys(values).length) { dropped.push(`empty update ${r.data.lineId}`); continue; }
      lines.set(r.data.lineId, { op: 'update', groupKey: group.key, lineId: r.data.lineId, values });
      continue;
    }

    if (op === 'create') {
      let id = r.data.lineId ?? '';
      if (!id.startsWith('tmp_') || lines.has(id)) {
        do { id = `tmp_${++tmpCounter}`; } while (lines.has(id));
      }
      lines.set(id, { op: 'create', groupKey: group.key, lineId: id, values });
      continue;
    }
    dropped.push(`bad line op ${op}`);
  }

  return { set: { fieldOps: [...fields.values()], lineOps: [...lines.values()] }, dropped };
}

/** A created line can only be saved once every required column has a value. */
export function missingColumns(op: LineOp): string[] {
  const group = GROUP_BY_KEY.get(op.groupKey);
  if (!group || op.op !== 'create') return [];
  return group.columns.filter((c) => c.required && op.values?.[c.key] === undefined).map((c) => c.key);
}

export const isComplete = (op: FieldOp | LineOp) => !('lineId' in op) || missingColumns(op).length === 0;

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Keys of ops whose content differs between two sets (added, changed or removed). */
export function changedKeys(prev: ProposalSet, next: ProposalSet): { changed: string[]; removed: string[] } {
  const index = (s: ProposalSet) => new Map<string, FieldOp | LineOp>([...s.fieldOps, ...s.lineOps].map((o) => [opKey(o), o]));
  const a = index(prev);
  const b = index(next);
  const changed = [...b].filter(([k, op]) => !sameValue(a.get(k), op)).map(([k]) => k);
  const removed = [...a.keys()].filter((k) => !b.has(k));
  return { changed, removed };
}

// Commit payload accepted by the API.
export const commitBody = z.object({
  baseVersion: z.number().int(),
  proposals: rawProposalSet,
});
export type CommitBody = z.infer<typeof commitBody>;
