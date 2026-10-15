import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ContactTiles } from '@/components/ContactTiles';
import { HeaderMeta } from '@/components/HeaderMeta';
import { Icon } from '@/components/Icon';
import { Button, IconButton, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { shortDate, time } from '@/lib/date';
import { colors, fonts } from '@/lib/theme';

export default function JobDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api.job(id) });

  const start = useMutation({
    mutationFn: () => api.startJob(id),
    onSuccess: (data) => {
      queryClient.setQueryData(['job', id], data);
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      router.push({ pathname: '/jobs/[id]/form', params: { id } });
    },
  });

  if (!job.data) {
    return (
      <SafeAreaView style={styles.center}>
        {job.error ? <T>{(job.error as Error).message}</T> : <ActivityIndicator />}
      </SafeAreaView>
    );
  }
  const j = job.data;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={styles.bar}>
          <IconButton icon="back" label="Back to today's jobs" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
        <View style={styles.head}>
          <T style={styles.eyebrow}>
            {j.code} · TODAY {time(j.scheduledStart)}–{time(j.scheduledEnd)}
          </T>
          <T style={styles.h1}>{j.title}</T>
          <HeaderMeta job={j} />
          {j.description ? <T style={styles.desc}>{j.description}</T> : null}
        </View>

        <T style={styles.sec}>Client</T>
        <View style={styles.card}>
          <View>
            <T style={styles.name}>{j.client.name}</T>
            <T style={styles.address}>
              {j.client.address}, {j.client.city}
            </T>
          </View>
          {j.client.accessNote ? (
            <View style={styles.note}>
              <Icon name="info" size={16} color={colors.textMuted} />
              <T style={styles.noteText}>{j.client.accessNote}</T>
            </View>
          ) : null}
          <ContactTiles client={j.client} eta="25 min" />
        </View>

        <View style={styles.secRow}>
          <T style={styles.secText}>History</T>
          {j.appliance ? (
            <T style={styles.secText}>
              {j.appliance.label}
              {j.appliance.yearBuilt ? ` · ${j.appliance.yearBuilt}` : ''}
            </T>
          ) : null}
        </View>
        <View style={styles.hist}>
          {j.history.length === 0 ? <T style={styles.noHistory}>First visit to this client.</T> : null}
          {j.history.map((h, i) => (
            <Pressable key={h.jobId} accessibilityRole="button" style={[styles.histRow, i > 0 && styles.histBorder]}>
              <T style={styles.histDate}>{shortDate(h.date)}</T>
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontFamily: fonts.medium }}>{h.title}</T>
                <T style={{ fontSize: 13, color: colors.textMuted }}>{h.outcome}</T>
              </View>
              <Icon name="chevron" size={16} color={colors.empty} strokeWidth={2} />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.cta}>
        {start.error ? <T style={styles.error}>{(start.error as ApiError).message}</T> : null}
        <Button
          title={j.status === 'scheduled' ? 'Start job' : j.status === 'done' ? 'Open report' : 'Continue job'}
          icon="play"
          loading={start.isPending}
          onPress={() => (j.status === 'scheduled' ? start.mutate() : router.push({ pathname: '/jobs/[id]/form', params: { id } }))}
          style={{ height: 56 }}
        />
      </SafeAreaView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { paddingHorizontal: 16, paddingTop: 8 },
  head: { paddingHorizontal: 28, paddingTop: 14 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted },
  h1: { fontFamily: fonts.semibold, fontSize: 26, letterSpacing: -0.6, marginTop: 4 },
  desc: { fontSize: 15, lineHeight: 22, color: colors.text, marginTop: 12 },
  sec: { paddingHorizontal: 28, marginTop: 20, marginBottom: 8, fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, marginTop: 20, marginBottom: 8 },
  secText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  card: { marginHorizontal: 16, backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 12 },
  name: { fontFamily: fonts.semibold, fontSize: 17 },
  address: { fontSize: 15, color: colors.text, lineHeight: 21 },
  note: { flexDirection: 'row', gap: 8, backgroundColor: colors.ground, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  hist: { marginHorizontal: 16, backgroundColor: colors.surface, borderRadius: 18, padding: 4 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 6, paddingHorizontal: 12 },
  histBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  histDate: { width: 72, fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted },
  noHistory: { padding: 12, color: colors.textMuted },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: colors.ground, borderTopWidth: 1, borderTopColor: colors.hairline, gap: 8 },
  error: { color: colors.red, textAlign: 'center' },
});
