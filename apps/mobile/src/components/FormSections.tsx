import { StyleSheet, View } from 'react-native';
import {
  FIELDS,
  GROUP_BY_KEY,
  LINE_GROUPS,
  SECTIONS,
  formatDuration,
  formatValue,
  missingColumns,
  opKey,
  type FieldValue,
  type JobDetailDto,
  type LineOp,
  type LineValues,
} from '@formcast/shared';
import { colors } from '@/lib/theme';
import { shortDate } from '@/lib/date';
import type { Draft } from '@/voice/drafts';
import { ProposalRow, type RowKind } from './ProposalRow';
import { Card, SectionHeader, T } from './ui';

const materials = GROUP_BY_KEY.get('materials')!;
const col = (key: string) => materials.columns.find((c) => c.key === key)!;
const titleCase = (s: unknown) => (typeof s === 'string' && s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
const lineSub = (v: LineValues) =>
  [v.quantity !== undefined ? formatValue(col('quantity'), v.quantity) : null, v.unit ? formatValue(col('unit'), v.unit) : null].filter(Boolean).join(' ') || '—';

function FieldRows({ section, job, draft, onReject }: { section: string; job: JobDetailDto; draft: Draft; onReject: (key: string) => void }) {
  return (
    <Card>
      {FIELDS.filter((f) => f.section === section).map((f) => {
        const committed = job.values[f.key];
        const op = draft.pending.fieldOps.find((o) => o.fieldKey === f.key);
        const key = `field:${f.key}`;
        let kind: RowKind = 'committed';
        let value = formatValue(f, committed);
        let previous: string | undefined;
        if (op?.op === 'set') {
          kind = 'pending';
          value = formatValue(f, op.value as FieldValue);
          if (committed !== undefined && JSON.stringify(committed) !== JSON.stringify(op.value)) previous = formatValue(f, committed);
        } else if (op?.op === 'clear' && committed !== undefined) {
          kind = 'removing';
        }
        return (
          <ProposalRow
            key={f.key}
            rowKey={key}
            kind={kind}
            label={f.label}
            value={value}
            previous={previous}
            changedAt={draft.changedAt[key]}
            onReject={() => onReject(key)}
          />
        );
      })}
    </Card>
  );
}

function MaterialRows({ job, draft, onReject }: { job: JobDetailDto; draft: Draft; onReject: (key: string) => void }) {
  const ops = new Map<string, LineOp>(draft.pending.lineOps.map((o) => [o.lineId, o]));
  const committed = job.lines.filter((l) => l.groupKey === 'materials');
  const creates = draft.pending.lineOps.filter((o) => o.op === 'create');
  const empty = !committed.length && !creates.length && !draft.ghosts.length;

  return (
    <Card>
      {empty ? (
        <View style={styles.empty}>
          <T style={{ color: colors.text }}>No materials yet</T>
          <T style={{ fontSize: 13, color: colors.textFaint }}>Say what you used, like “12 meters of cable”</T>
        </View>
      ) : null}
      {committed.map((l) => {
        const op = ops.get(l.id);
        const values = op?.op === 'update' ? { ...l.values, ...op.values } : l.values;
        const kind: RowKind = op?.op === 'delete' ? 'removing' : op?.op === 'update' ? 'pending' : 'committed';
        return (
          <ProposalRow
            key={l.id}
            rowKey={`line:${l.id}`}
            tall
            kind={kind}
            label={titleCase(values.material)}
            sublabel={lineSub(values)}
            badge={op?.op === 'delete' ? 'Remove' : undefined}
            changedAt={op ? draft.changedAt[opKey(op)] : undefined}
            onReject={op ? () => onReject(opKey(op)) : undefined}
          />
        );
      })}
      {creates.map((op) => {
        const missing = missingColumns(op);
        const v = op.values ?? {};
        return (
          <ProposalRow
            key={op.lineId}
            rowKey={opKey(op)}
            tall
            kind={missing.length ? 'incomplete' : 'pending'}
            label={v.material ? titleCase(v.material) : 'New material'}
            sublabel={missing.length ? `${lineSub(v)} · ${missing.join(', ')} missing` : lineSub(v)}
            badge={missing.length ? `Needs ${missing[0]}` : 'New'}
            changedAt={draft.changedAt[opKey(op)]}
            onReject={() => onReject(opKey(op))}
          />
        );
      })}
      {draft.ghosts.map((g) => (
        <ProposalRow key={`ghost-${g.key}`} tall kind="ghost" label={titleCase(g.op.values?.material)} sublabel={lineSub(g.op.values ?? {})} badge="Dropped" />
      ))}
    </Card>
  );
}

/** The form body: Appliance, Measurements, Materials used, Conclusion, Job. */
export function FormSections({ job, draft, onReject }: { job: JobDetailDto; draft: Draft; onReject: (key: string) => void }) {
  const value = (key: string) => {
    const op = draft.pending.fieldOps.find((o) => o.fieldKey === key);
    return op ? (op.op === 'set' ? op.value : undefined) : job.values[key];
  };
  const filled = (section: string) => {
    const keys = FIELDS.filter((f) => f.section === section).map((f) => f.key);
    return `${keys.filter((k) => value(k) !== undefined).length} of ${keys.length}`;
  };
  const materialCount = job.lines.length + draft.pending.lineOps.filter((o) => o.op === 'create').length - draft.pending.lineOps.filter((o) => o.op === 'delete').length;
  const duration = formatDuration(value('arrivalTime'), value('endTime'));

  return (
    <View>
      {SECTIONS.flatMap((s) => {
        const header = (
          <SectionHeader
            key={`h-${s.key}`}
            title={s.label}
            right={
              s.key === 'appliance' && job.appliancePrefilledFrom
                ? `From visit of ${shortDate(job.appliancePrefilledFrom).toLowerCase()}`
                : s.key === 'job'
                  ? duration
                    ? `Duration ${duration}`
                    : null
                  : filled(s.key)
            }
          />
        );
        const rows = <FieldRows key={s.key} section={s.key} job={job} draft={draft} onReject={onReject} />;
        // Materials sit between Measurements and Conclusion.
        if (s.key === 'conclusion') {
          return [
            <SectionHeader key="h-materials" title={LINE_GROUPS[0]!.label} right={String(Math.max(0, materialCount))} />,
            <MaterialRows key="materials" job={job} draft={draft} onReject={onReject} />,
            header,
            rows,
          ];
        }
        return [header, rows];
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { paddingHorizontal: 12, paddingVertical: 12, gap: 2 },
});
