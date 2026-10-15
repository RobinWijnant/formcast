import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProposalRow } from '@/components/ProposalRow';
import { Button, T } from '@/components/ui';
import { usePrefs } from '@/lib/prefs';
import { colors, fonts } from '@/lib/theme';
import { FILL_FLASH_MS, type FillStage } from '@/voice/drafts';

const SENTENCE = '“Used fifteen meters of cable”';
const LOOP_MS = 9000;
const TYPE_MS = 45;
const HEARD_AT = SENTENCE.length * TYPE_MS + 300;
/** The demo row joins its countdown halfway, so the fill comes quickly. */
const COUNTDOWN_LEFT_MS = 2500;

/** Plays the fill animation on a loop: speech appears, the row is heard, then fills. */
function Demo() {
  const [cycle, setCycle] = useState(0);
  const [typed, setTyped] = useState(0);
  const [heardAt, setHeardAt] = useState<number | null>(null);
  const [stage, setStage] = useState<FillStage | undefined>('heard');

  useEffect(() => {
    const typing = setInterval(() => setTyped((n) => Math.min(SENTENCE.length, n + 1)), TYPE_MS);
    const timers = [
      setTimeout(() => {
        setHeardAt(Date.now());
        setStage('heard');
      }, HEARD_AT),
      setTimeout(() => setStage('flash'), HEARD_AT + COUNTDOWN_LEFT_MS),
      setTimeout(() => setStage(undefined), HEARD_AT + COUNTDOWN_LEFT_MS + FILL_FLASH_MS),
      setTimeout(() => {
        setTyped(0);
        setHeardAt(null);
        setCycle((c) => c + 1);
      }, LOOP_MS),
    ];
    return () => {
      clearInterval(typing);
      timers.forEach(clearTimeout);
    };
  }, [cycle]);

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.say}>
        <View style={styles.liveDot} />
        <T style={styles.sayText}>{SENTENCE.slice(0, typed)}</T>
      </View>
      <View style={styles.demo}>
        {heardAt ? (
          <ProposalRow key={`${cycle}`} kind="pending" tall label="Cable" sublabel="15 m" badge="New" stage={stage} changedAt={heardAt - COUNTDOWN_LEFT_MS} onReject={() => undefined} />
        ) : (
          <ProposalRow kind="committed" tall label="Materials" sublabel="—" />
        )}
        <ProposalRow kind="committed" label="CO" value="12 ppm" />
      </View>
    </View>
  );
}

export default function Permission() {
  const [loading, setLoading] = useState(false);
  const done = () => {
    usePrefs.getState().update({ micPrimed: true });
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.page}>
      <View style={{ marginTop: 40 }}>
        <Demo />
      </View>
      <T style={styles.h1}>Talk, and the form fills itself</T>
      <T style={styles.sub}>Formcast listens only while you have a job open and tap Start speaking. Nothing is saved until you tap Save.</T>
      <View style={{ flex: 1 }} />
      <Button
        title="Allow microphone"
        icon="mic"
        loading={loading}
        onPress={async () => {
          setLoading(true);
          await requestRecordingPermissionsAsync().catch(() => undefined);
          setLoading(false);
          done();
        }}
      />
      <Button title="Not now" variant="ghost" onPress={done} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 24, paddingBottom: 12 },
  say: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, backgroundColor: colors.ink, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.recordDot },
  sayText: { color: colors.onInk, fontSize: 16 },
  demo: { backgroundColor: colors.surface, borderRadius: 20, padding: 6, gap: 4 },
  h1: { fontFamily: fonts.semibold, fontSize: 30, letterSpacing: -0.9, marginTop: 36, marginBottom: 8 },
  sub: { fontSize: 16, lineHeight: 24, color: colors.textMuted },
});
