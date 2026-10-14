import type { FieldValue } from './ops';
import type { ColumnDef, FieldDef } from './schema';

export function formatValue(def: Pick<FieldDef, 'type' | 'options' | 'unit'> | ColumnDef, value: FieldValue | undefined | null): string {
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) return '—';
  const label = (v: string) => def.options?.find((o) => o.value === v)?.label ?? v;
  let s: string;
  switch (def.type) {
    case 'boolean':
      s = value ? 'Yes' : 'No';
      break;
    case 'select':
      s = label(String(value));
      break;
    case 'multiselect':
      s = (value as string[]).map(label).join(', ');
      break;
    case 'date':
      s = new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      break;
    default:
      s = String(value);
  }
  const unit = 'unit' in def ? def.unit : undefined;
  return unit ? `${s} ${unit}` : s;
}

/** "10:00" + "11:30" -> "1 h 30". */
export function formatDuration(start: unknown, end: unknown): string | null {
  if (typeof start !== 'string' || typeof end !== 'string') return null;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const d = toMin(end) - toMin(start);
  if (!Number.isFinite(d) || d <= 0) return null;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
}
