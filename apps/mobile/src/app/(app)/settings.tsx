import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { getRecordingPermissionsAsync } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '@/components/Icon';
import { IconButton, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePrefs } from '@/lib/prefs';
import { colors, fonts } from '@/lib/theme';

const DELAYS = [3000, 5000, 8000];

function Row({ label, children, onPress }: { label: string; children: React.ReactNode; onPress?: () => void }) {
  const content = (
    <>
      <T style={styles.label}>{label}</T>
      {children}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

export default function Settings() {
  const user = useAuth((s) => s.user);
  const prefs = usePrefs();
  const [mic, setMic] = useState<string>('…');

  useEffect(() => {
    void getRecordingPermissionsAsync()
      .then((p) => setMic(p.granted ? 'Allowed' : p.canAskAgain ? 'Not asked yet' : 'Off'))
      .catch(() => setMic('Unknown'));
  }, []);

  const initials = (user?.name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  async function signOut() {
    const { refreshToken, clear } = useAuth.getState();
    if (refreshToken) await api.signOut(refreshToken).catch(() => undefined);
    await clear();
    router.replace('/sign-in');
  }

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.bar}>
          <IconButton icon="back" label="Back to today's jobs" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
          <T style={styles.title}>Profile and settings</T>
        </View>

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <T style={styles.avatarText}>{initials}</T>
          </View>
          <View style={{ gap: 2, flex: 1 }}>
            <T style={{ fontFamily: fonts.semibold, fontSize: 17 }}>{user?.name}</T>
            <T style={{ fontSize: 14, color: colors.textMuted }}>{user?.email}</T>
            <T style={{ fontFamily: fonts.mono, fontSize: 12, color: colors.textMuted }}>Technician · GV-00000</T>
          </View>
        </View>

        <T style={styles.sec}>Voice</T>
        <View style={styles.card}>
          <Row label="Speech language">
            <T style={styles.value}>English</T>
          </Row>
          <Row
            label="Auto-fill delay"
            onPress={() => prefs.update({ fillDelayMs: DELAYS[(DELAYS.indexOf(prefs.fillDelayMs) + 1) % DELAYS.length]! })}
          >
            <View style={styles.valueRow}>
              <T style={styles.value}>{prefs.fillDelayMs / 1000} s</T>
              <Icon name="chevron" size={16} color={colors.empty} strokeWidth={2} />
            </View>
          </Row>
          <Row label="Show live transcript">
            <Switch accessibilityLabel="Show live transcript" value={prefs.showTranscript} onValueChange={(v) => prefs.update({ showTranscript: v })} trackColor={{ true: colors.ink }} />
          </Row>
          <Row label="Vibrate when a field fills">
            <Switch accessibilityLabel="Vibrate when a field fills" value={prefs.vibrateOnFill} onValueChange={(v) => prefs.update({ vibrateOnFill: v })} trackColor={{ true: colors.ink }} />
          </Row>
        </View>

        <T style={styles.sec}>Demo</T>
        <View style={styles.card}>
          <Row label="Play recorded demo script">
            <Switch accessibilityLabel="Play recorded demo script instead of the microphone" value={prefs.demoVoice} onValueChange={(v) => prefs.update({ demoVoice: v })} trackColor={{ true: colors.ink }} />
          </Row>
        </View>
        <T style={styles.note}>Streams the brief's demo script instead of the microphone. Each press of Start speaking plays the next round.</T>

        <T style={styles.sec}>App</T>
        <View style={styles.card}>
          <Row label="Microphone">
            <T style={[styles.value, mic === 'Allowed' && { color: colors.green }]}>{mic}</T>
          </Row>
          <Row label="Version">
            <T style={[styles.value, { fontFamily: fonts.mono }]}>{Constants.expoConfig?.version ?? '1.0.0'}</T>
          </Row>
        </View>

        <Pressable accessibilityRole="button" onPress={signOut} style={({ pressed }) => [styles.out, pressed && { opacity: 0.7 }]}>
          <T style={styles.outText}>Sign out</T>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  title: { fontFamily: fonts.semibold, fontSize: 17 },
  profile: { marginHorizontal: 16, marginTop: 20, backgroundColor: colors.surface, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.amber, fontFamily: fonts.semibold, fontSize: 20 },
  sec: { paddingHorizontal: 28, marginTop: 22, marginBottom: 8, fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  card: { marginHorizontal: 16, backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  label: { flex: 1, fontSize: 15, color: colors.text },
  value: { fontSize: 15, color: colors.textMuted },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  note: { paddingHorizontal: 28, marginTop: 8, fontSize: 13, lineHeight: 18, color: colors.textFaint },
  out: { marginHorizontal: 16, marginTop: 22, height: 52, borderRadius: 16, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  outText: { color: colors.red, fontFamily: fonts.semibold, fontSize: 16 },
});
