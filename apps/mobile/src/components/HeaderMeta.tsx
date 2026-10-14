import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FIELD_BY_KEY, formatValue, type JobDetailDto } from '@formcast/shared';
import { usePrefs } from '@/lib/prefs';
import { colors, fonts } from '@/lib/theme';
import type { Draft } from '@/voice/drafts';
import { CountdownRing } from './CountdownRing';
import { Icon } from './Icon';
import { T } from './ui';

/** True while a proposal is still in its countdown. */
export function useHeard(changedAt: number | undefined) {
  const delay = usePrefs((s) => s.fillDelayMs);
  const [, tick] = useState(0);
  const until = (changedAt ?? 0) + delay;
  useEffect(() => {
    const wait = until - Date.now();
    if (wait <= 0) return;
    const t = setTimeout(() => tick((n) => n + 1), wait);
    return () => clearTimeout(t);
  }, [until]);
  return changedAt !== undefined && Date.now() < until;
}

/** Priority and tags in the job header; both can be changed by voice. */
export function HeaderMeta({ job, draft, onReject, onEdit }: { job: JobDetailDto; draft?: Draft; onReject?: (key: string) => void; onEdit?: (fieldKey: 'priority' | 'tags') => void }) {
  const delay = usePrefs((s) => s.fillDelayMs);
  const pOp = draft?.pending.fieldOps.find((o) => o.fieldKey === 'priority');
  const tOp = draft?.pending.fieldOps.find((o) => o.fieldKey === 'tags');
  const pHeard = useHeard(pOp ? draft?.changedAt['field:priority'] : undefined);
  const tHeard = useHeard(tOp ? draft?.changedAt['field:tags'] : undefined);

  const priority = String(pOp?.op === 'set' ? pOp.value : job.values.priority ?? job.priority);
  const committedTags = (job.values.tags as string[] | undefined) ?? job.tags;
  const tags = tOp ? (tOp.op === 'set' ? (tOp.value as string[]) : []) : committedTags;
  const removedTags = tOp ? committedTags.filter((t) => !tags.includes(t)) : [];
  const tagLabel = (t: string) => t;

  return (
    <View style={styles.meta}>
      <Pressable
        disabled={!onEdit}
        onPress={() => onEdit?.('priority')}
        accessibilityRole={onEdit ? 'button' : undefined}
        accessibilityLabel={onEdit ? 'Edit priority' : undefined}
        style={[styles.pill, priority === 'high' && styles.high, pHeard && styles.heard]}
      >
        <T style={[styles.pillText, priority === 'high' && { color: '#8F2416' }, pHeard && { color: colors.amberText }]}>
          Priority · {formatValue(FIELD_BY_KEY.get('priority')!, priority)}
        </T>
        {pOp && !pHeard ? <Icon name="check" size={15} color={colors.green} strokeWidth={2.25} /> : null}
      </Pressable>
      {pHeard && onReject ? <CountdownRing startedAt={draft!.changedAt['field:priority']!} duration={delay} onReject={() => onReject('field:priority')} label="Reject priority change" /> : null}

      {tags.map((t, i) => (
        <Pressable
          key={t}
          disabled={!onEdit}
          onPress={() => onEdit?.('tags')}
          accessibilityRole={onEdit ? 'button' : undefined}
          accessibilityLabel={onEdit ? 'Edit tags' : undefined}
          style={[styles.pill, tHeard && styles.heard]}
        >
          <T style={[styles.pillText, tHeard && { color: colors.amberText }]}>{tagLabel(t)}</T>
          {tOp && !tHeard && i === tags.length - 1 ? <Icon name="check" size={15} color={colors.green} strokeWidth={2.25} /> : null}
        </Pressable>
      ))}
      {tHeard
        ? removedTags.map((t) => (
            <View key={`x-${t}`} style={[styles.pill, styles.removed]}>
              <T style={[styles.pillText, styles.struck]}>{tagLabel(t)}</T>
            </View>
          ))
        : null}
      {!tags.length && !removedTags.length ? (
        <Pressable
          disabled={!onEdit}
          onPress={() => onEdit?.('tags')}
          accessibilityRole={onEdit ? 'button' : undefined}
          style={[styles.pill, styles.muted]}
        >
          <T style={[styles.pillText, { color: colors.textFaint, fontFamily: fonts.regular }]}>{onEdit ? '+ Add tags' : 'No tags'}</T>
        </Pressable>
      ) : null}
      {tHeard && onReject ? <CountdownRing startedAt={draft!.changedAt['field:tags']!} duration={delay} onReject={() => onReject('field:tags')} label="Reject tags change" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12, minHeight: 30 },
  pill: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 14, backgroundColor: colors.chip, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1.5, borderColor: 'transparent' },
  high: { backgroundColor: '#FBE0DC' },
  heard: { backgroundColor: colors.amberFill, borderColor: colors.amberBorder, borderStyle: 'dashed' },
  removed: { backgroundColor: '#E9EBE6' },
  muted: { backgroundColor: 'transparent', borderColor: '#B8BCB6', borderStyle: 'dashed', borderWidth: 1 },
  pillText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  struck: { textDecorationLine: 'line-through', color: colors.textFaint },
});
