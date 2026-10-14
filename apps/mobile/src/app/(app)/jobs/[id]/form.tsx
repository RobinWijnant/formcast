import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dock, DockError } from '@/components/Dock';
import { EditSheet, type EditTarget } from '@/components/EditSheet';
import { FormSections } from '@/components/FormSections';
import { HeaderMeta } from '@/components/HeaderMeta';
import { Icon } from '@/components/Icon';
import { RowRegistry } from '@/components/rowRegistry';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { usePrefs } from '@/lib/prefs';
import { colors, fonts } from '@/lib/theme';
import { pendingCount, useDraft, useDrafts } from '@/voice/drafts';
import { useVoiceSession } from '@/voice/useVoiceSession';

export default function JobForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api.job(id) });
  const draft = useDraft(id);
  const voice = useVoiceSession(id);
  const showTranscript = usePrefs((s) => s.showTranscript);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const leaving = useRef(false);
  const dirty = pendingCount(draft) > 0;
  const rows = useMemo(() => new Map<string, View>(), []);
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const scrollY = useRef(0);
  const { height } = useWindowDimensions();

  // While talking, bring the field that just changed into view (above the dock).
  const latestChange = Object.entries(draft.changedAt).sort((a, b) => b[1] - a[1])[0];
  useEffect(() => {
    if (!latestChange || !voice.active) return;
    const row = rows.get(latestChange[0]);
    if (!row || !content.current) return;
    row.measureLayout(
      content.current,
      (_x, y, _w, h) => {
        const visibleTop = scrollY.current + 60;
        const visibleBottom = scrollY.current + height - 300;
        if (y < visibleTop || y + h > visibleBottom) scroll.current?.scrollTo({ y: Math.max(0, y - 140), animated: true });
      },
      () => undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestChange?.[0], latestChange?.[1]]);

  const save = useMutation({
    mutationFn: async () => {
      const current = job.data!;
      return api.commit(id, { baseVersion: current.version, proposals: useDrafts.getState().drafts[id]?.pending ?? draft.pending });
    },
    onSuccess: ({ job: saved }) => {
      queryClient.setQueryData(['job', id], saved);
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      useDrafts.getState().clear(id);
      setSavedAt(Date.now());
      setSaveError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        void job.refetch();
        setSaveError('This job changed elsewhere. Your changes are still here; tap Save again.');
      } else setSaveError(err instanceof ApiError ? err.message : 'Saving failed. Try again.');
    },
  });

  // Back with unsaved changes asks first.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (leaving.current || !pendingCount(useDrafts.getState().drafts[id] ?? draft)) return;
        e.preventDefault();
        setLeaveOpen(true);
      }),
    [navigation, id, draft],
  );

  const leave = () => {
    leaving.current = true;
    voice.stop();
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/jobs/[id]', params: { id } });
  };

  const onBack = () => {
    if (pendingCount(useDrafts.getState().drafts[id] ?? draft)) setLeaveOpen(true);
    else leave();
  };

  if (!job.data) {
    return (
      <SafeAreaView style={styles.center}>
        {job.error ? <T>{(job.error as Error).message}</T> : <ActivityIndicator />}
      </SafeAreaView>
    );
  }
  const j = job.data;
  const recording = voice.active;
  // Hand edits only while not talking, so speech and fingers don't overwrite each other.
  const onEdit = recording ? undefined : (t: EditTarget) => setEditing(t);
  const saved = !dirty && savedAt !== null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <View style={styles.bar}>
        <IconButton icon="back" label="Back to job details" onPress={onBack} />
        {recording ? (
          <View style={{ flex: 1, gap: 2 }}>
            <T style={styles.eyebrow} numberOfLines={1}>
              {j.code} · {j.client.name.toUpperCase()}
            </T>
            <T style={styles.title2} numberOfLines={1}>
              {j.title}
            </T>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !dirty }}
          onPress={() => dirty && save.mutate()}
          style={({ pressed }) => [
            styles.save,
            recording || !dirty ? styles.saveQuiet : styles.saveActive,
            !dirty && !recording && styles.saveDisabled,
            pressed && dirty && { opacity: 0.8 },
          ]}
        >
          {save.isPending ? (
            <ActivityIndicator color={recording ? colors.ink : '#FFFFFF'} />
          ) : (
            <>
              {saved ? <Icon name="check" size={18} color={colors.textMuted} strokeWidth={2} /> : null}
              <T style={[styles.saveText, { color: !dirty ? (recording ? colors.ink : '#7D8287') : recording ? colors.ink : '#FFFFFF' }, saved && { color: colors.textMuted }]}>
                {saved ? 'Saved' : 'Save'}
              </T>
            </>
          )}
        </Pressable>
      </View>

      <ScrollView
        ref={scroll}
        onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={32}
        contentContainerStyle={{ paddingBottom: 260 }}
      >
        <RowRegistry.Provider value={rows}>
        <View ref={content} collapsable={false}>
        {!recording ? (
          <View style={styles.head}>
            <T style={styles.eyebrow}>{j.code} · TODAY</T>
            <T style={styles.h1}>{j.title}</T>
            <T style={styles.client}>{j.client.name}</T>
            <HeaderMeta job={j} draft={draft} onReject={voice.reject} onEdit={onEdit && ((fieldKey) => onEdit({ kind: 'field', fieldKey }))} />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 28 }}>
            <HeaderMeta job={j} draft={draft} onReject={voice.reject} />
          </View>
        )}
        {saveError ? <T style={styles.saveError}>{saveError}</T> : null}
        <FormSections job={j} draft={draft} onReject={voice.reject} onEdit={onEdit} />
        </View>
        </RowRegistry.Provider>
      </ScrollView>

      {voice.error?.kind === 'permission' || voice.error?.kind === 'mic' ? (
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <View style={styles.alert} accessibilityRole="alert">
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={styles.alertIcon}>
                <Icon name="micOff" color={colors.red} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <T style={{ fontFamily: fonts.semibold, fontSize: 16 }}>Microphone is off for Formcast</T>
                <T style={{ fontSize: 14, lineHeight: 20, color: colors.textMuted }}>Turn on microphone access in Settings to fill this job by voice.</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Open settings" onPress={() => void Linking.openSettings()} style={{ height: 44 }} />
              <Button title="Not now" variant="ghost" onPress={voice.clearError} style={{ height: 44 }} />
            </View>
          </View>
        </SafeAreaView>
      ) : voice.error && !recording ? (
        <DockError error={voice.error} onRetry={() => void voice.start()} onDismiss={voice.clearError} />
      ) : recording ? (
        <Dock state={voice.state} transcript={voice.transcript} showTranscript={showTranscript} levels={voice.levels} startedAt={voice.startedAt} onStop={voice.stop} />
      ) : (
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <T style={styles.hint}>Talk naturally, or tap a field to type.</T>
          <Button title="Start speaking" icon="mic" variant="amber" big onPress={() => void voice.start()} style={styles.mic} />
        </SafeAreaView>
      )}

      <EditSheet target={editing} job={j} draft={draft} jobId={id} onClose={() => setEditing(null)} />

      <Sheet
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Leave without saving?"
        body={`You have ${pendingCount(draft)} unsaved change${pendingCount(draft) === 1 ? '' : 's'}. Values already on the job stay as they are.`}
      >
        <Button
          title="Save and leave"
          loading={save.isPending}
          onPress={() =>
            save.mutate(undefined, {
              onSuccess: () => {
                setLeaveOpen(false);
                leave();
              },
            })
          }
        />
        <Button
          title="Discard changes"
          variant="danger"
          onPress={() => {
            useDrafts.getState().clear(id);
            setLeaveOpen(false);
            leave();
          }}
        />
        <Button title="Stay" variant="quiet" onPress={() => setLeaveOpen(false)} />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  eyebrow: { fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted },
  title2: { fontFamily: fonts.semibold, fontSize: 17 },
  save: { height: 44, borderRadius: 22, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 76, justifyContent: 'center' },
  saveActive: { backgroundColor: colors.ink },
  saveQuiet: { backgroundColor: colors.surface },
  saveDisabled: { backgroundColor: colors.chip },
  saveText: { fontFamily: fonts.semibold, fontSize: 15 },
  head: { paddingHorizontal: 28, paddingTop: 10 },
  h1: { fontFamily: fonts.semibold, fontSize: 26, letterSpacing: -0.6, marginTop: 4 },
  client: { fontSize: 15, color: colors.text, marginTop: 2 },
  saveError: { marginHorizontal: 28, marginTop: 12, color: colors.red, fontSize: 14 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, gap: 12, backgroundColor: colors.ground, borderTopWidth: 1, borderTopColor: '#E2E4DF' },
  hint: { textAlign: 'center', fontSize: 13, color: colors.textFaint },
  mic: { shadowColor: colors.amber, shadowOpacity: 0.5, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, borderWidth: 6, borderColor: 'rgba(243,190,90,0.28)' },
  alert: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 12, borderWidth: 1, borderColor: '#F0C9C3' },
  alertIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.redFill, alignItems: 'center', justifyContent: 'center' },
});
