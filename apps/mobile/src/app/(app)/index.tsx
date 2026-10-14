import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { JobSummaryDto } from '@formcast/shared';
import { Icon } from '@/components/Icon';
import { IconButton, Pill, T } from '@/components/ui';
import { api } from '@/lib/api';
import { addDays, isoDay, longDate, minutesBetween, time, weekStart, weekdayShort } from '@/lib/date';
import { colors, fonts } from '@/lib/theme';

function Gap({ from, to }: { from: string; to: string }) {
  const minutes = minutesBetween(from, to);
  if (minutes <= 0) return <View style={{ height: 12 }} />;
  const travel = minutes < 60;
  return (
    <View style={styles.gap}>
      <View style={styles.gutter} />
      <View style={styles.gapLabel}>
        {travel ? <Icon name="car" size={14} color={colors.textFaint} /> : null}
        <T style={styles.gapText}>{travel ? `${minutes} min drive` : `${Math.round(minutes / 60)} h break`}</T>
      </View>
    </View>
  );
}

function JobCard({ job, upNext }: { job: JobSummaryDto; upNext: boolean }) {
  const done = job.status === 'done';
  return (
    <View style={styles.item}>
      <T style={[styles.time, upNext && { color: colors.ink, fontFamily: fonts.monoMedium }]}>{time(job.scheduledStart)}</T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${job.title} for ${job.clientName} at ${time(job.scheduledStart)}`}
        onPress={() => router.push({ pathname: '/jobs/[id]', params: { id: job.id } })}
        style={({ pressed }) => [styles.card, upNext && styles.cardNext, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.eyebrowRow}>
          <T style={styles.eyebrow} numberOfLines={1}>
            {job.code} · {time(job.scheduledStart)}–{time(job.scheduledEnd)}
          </T>
          {done ? (
            <View style={[styles.status, { backgroundColor: '#E3F3E7' }]}>
              <T style={[styles.statusText, { color: colors.greenInk }]}>Done</T>
            </View>
          ) : upNext ? (
            <View style={[styles.status, { backgroundColor: colors.ink }]}>
              <T style={[styles.statusText, { color: '#FFFFFF' }]}>{job.status === 'in_progress' ? 'In progress' : 'Up next'}</T>
            </View>
          ) : null}
        </View>
        <T style={[styles.title, done && { color: colors.icon }]}>{job.title}</T>
        <T style={[styles.client, done && { color: colors.icon }]}>{job.clientName}</T>
        {!done ? (
          <View style={styles.meta}>
            <Pill tone={job.priority === 'high' ? 'high' : 'neutral'}>Priority · {job.priority.charAt(0).toUpperCase() + job.priority.slice(1)}</Pill>
            {job.tags.map((t) => (
              <Pill key={t}>{t}</Pill>
            ))}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

export default function Today() {
  const today = isoDay();
  const [day, setDay] = useState(today);
  const monday = weekStart(day);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  const jobs = useQuery({ queryKey: ['jobs', day], queryFn: () => api.jobs(day) });
  const calendar = useQuery({ queryKey: ['calendar', monday], queryFn: () => api.calendar(monday, addDays(monday, 6)) });
  const upNext = jobs.data?.find((j) => j.status !== 'done');

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={jobs.isRefetching} onRefresh={() => void jobs.refetch()} />}
      >
        <View style={styles.top}>
          <View>
            <T style={styles.h1}>{day === today ? 'Today' : weekdayShort(day)}</T>
            <T style={styles.sub}>
              {longDate(day)}
              {jobs.data ? ` · ${jobs.data.length} job${jobs.data.length === 1 ? '' : 's'}` : ''}
            </T>
          </View>
          <IconButton icon="user" label="Your profile and settings" onPress={() => router.push('/settings')} />
        </View>

        <View style={styles.days}>
          {week.map((d) => {
            const on = d === day;
            const has = calendar.data?.includes(d);
            return (
              <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setDay(d)} style={[styles.day, on && styles.dayOn]}>
                <T style={[styles.dayName, on && { color: '#C9CDD0' }]}>{weekdayShort(d)}</T>
                <T style={[styles.dayNum, on && { color: '#FFFFFF' }]}>{Number(d.slice(8))}</T>
                <View style={[styles.dayDot, { backgroundColor: has ? (on ? colors.amber : '#B8BCB6') : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>

        <View style={styles.list}>
          {jobs.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} /> : null}
          {jobs.error ? <T style={styles.empty}>{(jobs.error as Error).message}</T> : null}
          {jobs.data?.length === 0 ? <T style={styles.empty}>No jobs planned on this day.</T> : null}
          {jobs.data?.map((job, i) => (
            <View key={job.id}>
              {i > 0 ? <Gap from={jobs.data[i - 1]!.scheduledEnd} to={job.scheduledStart} /> : null}
              <JobCard job={job} upNext={job.id === upNext?.id} />
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingLeft: 24, paddingRight: 20, paddingTop: 12 },
  h1: { fontFamily: fonts.semibold, fontSize: 32, letterSpacing: -1 },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  days: { flexDirection: 'row', gap: 4, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  day: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8, borderRadius: 14 },
  dayOn: { backgroundColor: colors.ink },
  dayName: { fontSize: 12, color: colors.textFaint },
  dayNum: { fontFamily: fonts.medium, fontSize: 17 },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  list: { paddingHorizontal: 16, paddingTop: 12 },
  item: { flexDirection: 'row', gap: 10 },
  time: { width: 48, textAlign: 'right', paddingTop: 16, fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted },
  card: { flex: 1, backgroundColor: colors.surface, borderRadius: 18, padding: 14, paddingHorizontal: 16, gap: 2, borderWidth: 1.5, borderColor: 'transparent' },
  cardNext: { borderColor: colors.ink },
  eyebrowRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted, flexShrink: 1 },
  status: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
  title: { fontFamily: fonts.semibold, fontSize: 17, letterSpacing: -0.2, marginTop: 2 },
  client: { fontSize: 14, color: colors.text },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  gap: { flexDirection: 'row', gap: 10, height: 34, alignItems: 'center' },
  gutter: { width: 48 },
  gapLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 16 },
  gapText: { fontSize: 12, color: colors.textFaint },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
});
