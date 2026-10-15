import { Pressable, StyleSheet, View } from 'react-native';
import { FIELD_BY_KEY, fieldOpKey, formatValue, type FieldValue, type JobDetailDto } from '@formcast/shared';
import { usePrefs } from '@/lib/prefs';
import { colors, fonts, PRIORITY_TONE } from '@/lib/theme';
import type { Draft } from '@/voice/drafts';
import { CountdownRing } from './CountdownRing';
import { Icon } from './Icon';
import { T } from './ui';

type HeaderKey = 'priority' | 'tags';

/** Committed value, pending op and fill stage of one header field. */
function headerField(job: JobDetailDto, draft: Draft | undefined, fieldKey: HeaderKey) {
  const key = fieldOpKey(fieldKey);
  const op = draft?.pending.fieldOps.find((o) => o.fieldKey === fieldKey);
  const committed = job.values[fieldKey];
  const value: FieldValue | undefined = op ? (op.op === 'set' ? op.value : undefined) : committed;
  return { key, op, committed, value, heard: draft?.stage[key] === 'heard', startedAt: draft?.changedAt[key] };
}

const Check = () => <Icon name="check" size={15} color={colors.green} strokeWidth={2.25} />;

/** Priority and tags in the job header; both can be changed by voice. */
export function HeaderMeta({ job, draft, onReject, onEdit }: { job: JobDetailDto; draft?: Draft; onReject?: (key: string) => void; onEdit?: (fieldKey: HeaderKey) => void }) {
  const delay = usePrefs((s) => s.fillDelayMs);
  const p = headerField(job, draft, 'priority');
  const t = headerField(job, draft, 'tags');

  const priority = String(p.value);
  const tags = (t.value as string[] | undefined) ?? [];
  const removedTags = t.op ? ((t.committed as string[] | undefined) ?? []).filter((v) => !tags.includes(v)) : [];

  const ring = (f: ReturnType<typeof headerField>, label: string) =>
    f.heard && onReject && f.startedAt !== undefined ? <CountdownRing startedAt={f.startedAt} duration={delay} onReject={() => onReject(f.key)} label={label} /> : null;
  const editable = (fieldKey: HeaderKey, label?: string) => ({
    disabled: !onEdit,
    onPress: () => onEdit?.(fieldKey),
    accessibilityRole: onEdit ? ('button' as const) : undefined,
    accessibilityLabel: onEdit ? label : undefined,
  });

  return (
    <View style={styles.meta}>
      <Pressable {...editable('priority', 'Edit priority')} style={[styles.pill, { backgroundColor: PRIORITY_TONE[priority]?.bg ?? colors.chip }, p.heard && styles.heard]}>
        <T style={[styles.pillText, { color: PRIORITY_TONE[priority]?.fg ?? colors.text }, p.heard && { color: colors.amberText }]}>
          {formatValue(FIELD_BY_KEY.get('priority')!, priority)} prio
        </T>
        {p.op && !p.heard ? <Check /> : null}
      </Pressable>
      {ring(p, 'Reject priority change')}

      {tags.map((tag, i) => (
        <Pressable key={tag} {...editable('tags', 'Edit tags')} style={[styles.pill, t.heard && styles.heard]}>
          <T style={[styles.pillText, t.heard && { color: colors.amberText }]}>{tag}</T>
          {t.op && !t.heard && i === tags.length - 1 ? <Check /> : null}
        </Pressable>
      ))}
      {t.heard
        ? removedTags.map((tag) => (
            <View key={`x-${tag}`} style={[styles.pill, styles.removed]}>
              <T style={[styles.pillText, styles.struck]}>{tag}</T>
            </View>
          ))
        : null}
      {!tags.length && !removedTags.length ? (
        <Pressable {...editable('tags')} style={[styles.pill, styles.muted]}>
          <T style={[styles.pillText, { color: colors.textFaint, fontFamily: fonts.regular }]}>{onEdit ? '+ Add tags' : 'No tags'}</T>
        </Pressable>
      ) : null}
      {ring(t, 'Reject tags change')}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12, minHeight: 30 },
  pill: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: colors.chip, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: 'transparent' },
  heard: { backgroundColor: colors.amberFill, borderColor: colors.amberBorder, borderStyle: 'dashed' },
  removed: { backgroundColor: colors.chipRemoved },
  muted: { backgroundColor: 'transparent', borderColor: colors.dashed, borderStyle: 'dashed', borderWidth: 1 },
  pillText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  struck: { textDecorationLine: 'line-through', color: colors.textFaint },
});
