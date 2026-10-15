import type { FieldValue } from './ops';
import type { ColumnDef, FieldDef, FieldType, Option } from './schema';

type Def = Pick<FieldDef, 'type' | 'options'> | ColumnDef;

/** Everything that differs per field type, in one place. */
export interface FieldTypeSpec {
  /** Coerces a raw value (model output, typed text). Undefined when it can't be applied. */
  normalize(def: Def, raw: unknown): FieldValue | undefined;
  /** Display text without the unit. */
  format(def: Def, value: FieldValue): string;
  /** Typed into a text box, or picked from options. */
  entry: 'type' | 'pick';
  /** Shown when typed input can't be read. */
  invalid?: string;
}

const TIME = /^(\d{1,2})[:.h](\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function matchOption(options: Option[] | undefined, raw: unknown) {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toLowerCase().replace(/\s+/g, '-');
  return options?.find((o) => o.value === v || o.label.toLowerCase().replace(/\s+/g, '-') === v)?.value;
}

const optionLabel = (def: Def, v: string) => def.options?.find((o) => o.value === v)?.label ?? v;

export const FIELD_TYPES: Record<FieldType, FieldTypeSpec> = {
  text: {
    entry: 'type',
    invalid: 'Enter a value.',
    normalize(_def, raw) {
      if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
      const s = String(raw).trim();
      return s.length ? s : undefined;
    },
    format: (_def, v) => String(v),
  },
  number: {
    entry: 'type',
    invalid: 'Enter a number.',
    normalize(_def, raw) {
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.').trim()) : NaN;
      return Number.isFinite(n) ? n : undefined;
    },
    format: (_def, v) => String(v),
  },
  time: {
    entry: 'type',
    invalid: 'Enter a time like 10:30.',
    normalize(_def, raw) {
      const m = typeof raw === 'string' ? TIME.exec(raw.trim()) : null;
      if (!m) return undefined;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h > 23 || min > 59) return undefined;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    },
    format: (_def, v) => String(v),
  },
  date: {
    entry: 'type',
    invalid: 'Enter a date like 2027-10-14.',
    normalize: (_def, raw) => (typeof raw === 'string' && DATE.test(raw.trim()) && !Number.isNaN(Date.parse(raw)) ? raw.trim() : undefined),
    format: (_def, v) => new Date(`${v}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  },
  boolean: {
    entry: 'pick',
    normalize(_def, raw) {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 'yes') return true;
      if (raw === 'false' || raw === 'no') return false;
      return undefined;
    },
    format: (_def, v) => (v ? 'Yes' : 'No'),
  },
  select: {
    entry: 'pick',
    normalize: (def, raw) => matchOption(def.options, raw),
    format: (def, v) => optionLabel(def, String(v)),
  },
  multiselect: {
    entry: 'pick',
    normalize(def, raw) {
      if (!Array.isArray(raw)) return undefined;
      const out: string[] = [];
      for (const r of raw) {
        const v = matchOption(def.options, r);
        if (v && !out.includes(v)) out.push(v);
      }
      return out;
    },
    format: (def, v) => (v as string[]).map((s) => optionLabel(def, s)).join(', '),
  },
};

/** Coerces a raw value to the field's type. Returns undefined when it can't be applied. */
export const normalizeValue = (def: Def, raw: unknown): FieldValue | undefined => FIELD_TYPES[def.type].normalize(def, raw);
