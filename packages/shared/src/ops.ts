import { z } from 'zod';
import { normalizeValue } from './fieldTypes';
import { FIELD_BY_KEY, GROUP_BY_KEY } from './schema';

const fieldValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const lineValues = z.record(z.string(), z.union([z.string(), z.number()]));

const fieldOp = z.object({
  op: z.enum(['set', 'clear']),
  fieldKey: z.string(),
  value: fieldValue.optional(),
});
const lineOp = z.object({
  op: z.enum(['create', 'update', 'delete']),
  groupKey: z.string(),
  /** DB id for update/delete, `tmp_<n>` for create. */
  lineId: z.string(),
  values: lineValues.optional(),
});
/** The full set of pending changes on top of the committed form. */
const proposalSet = z.object({
  fieldOps: z.array(fieldOp),
  lineOps: z.array(lineOp),
});

export type FieldValue = z.infer<typeof fieldValue>;
export type LineValues = z.infer<typeof lineValues>;
export type FieldOp = z.infer<typeof fieldOp>;
export type LineOp = z.infer<typeof lineOp>;
export type ProposalSet = z.infer<typeof proposalSet>;

export const EMPTY_PROPOSALS: ProposalSet = { fieldOps: [], lineOps: [] };

/** Identity of a pending change: one per field, one per line. */
export type OpKey = `field:${string}` | `line:${string}`;
export const fieldOpKey = (fieldKey: string): OpKey => `field:${fieldKey}`;
export const lineOpKey = (lineId: string): OpKey => `line:${lineId}`;
export const opKey = (op: FieldOp | LineOp): OpKey => ('fieldKey' in op ? fieldOpKey(op.fieldKey) : lineOpKey(op.lineId));

/** Ids of the lines saved on a job: the only valid update/delete targets. */
export const committedLineIds = (lines: { id: string }[]) => new Set(lines.map((l) => l.id));

// Loose shapes: what we accept from the model or a client before normalizing.
const rawFieldOp = fieldOp.extend({
  op: z.string(),
  value: z.unknown().optional(),
});
const rawLineOp = lineOp.extend({
  op: z.string(),
  lineId: z.string().optional().nullable(),
  values: z.record(z.string(), z.unknown()).optional().nullable(),
});
export const rawProposalSet = z.object({
  fieldOps: z.array(z.unknown()).default([]),
  lineOps: z.array(z.unknown()).default([]),
});

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
    if (r.data.op === 'clear') {
      if (def.required) { dropped.push(`${def.key} can't be empty`); continue; }
      fields.set(def.key, { op: 'clear', fieldKey: def.key });
      continue;
    }
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
