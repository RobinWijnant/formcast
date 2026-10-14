import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/lib/theme';
import type { VoiceError, VoiceState } from '@/voice/useVoiceSession';
import { Icon } from './Icon';
import { Button, T } from './ui';

function useElapsed(startedAt: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return '00:00';
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const label: Record<VoiceState, string> = {
  idle: 'Stopped',
  connecting: 'Connecting…',
  listening: 'Listening',
  updating: 'Updating…',
  stopping: 'Finishing…',
};

/** Dark live dock while a speaking session runs. */
export function Dock({
  state,
  transcript,
  showTranscript,
  levels,
  startedAt,
  onStop,
}: {
  state: VoiceState;
  transcript: { final: string; interim: string };
  showTranscript: boolean;
  levels: number[];
  startedAt: number | null;
  onStop: () => void;
}) {
  const insets = useSafeAreaInsets();
  const elapsed = useElapsed(startedAt);
  // Older words fade, the newest sentence stays bright.
  const sentences = transcript.final.split(/(?<=[.?!])\s+/).filter(Boolean);
  const latest = transcript.interim || sentences.at(-1) || '';
  const earlier = transcript.interim ? sentences.slice(-2).join(' ') : sentences.slice(-3, -1).join(' ');

  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
      {showTranscript ? (
        <T style={styles.transcript} numberOfLines={3}>
          {earlier ? `${earlier} ` : ''}
          <T style={styles.latest}>{latest || (state === 'listening' ? 'Say what you did…' : '')}</T>
        </T>
      ) : null}
      <View style={styles.row}>
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: state === 'updating' ? colors.amber : state === 'listening' ? '#F04438' : '#8A9096' }]} />
          <T style={styles.statusText}>{label[state]}</T>
          <T style={styles.timer}>{elapsed}</T>
          <View style={styles.levels} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {levels.map((l, i) => (
              <View key={i} style={[styles.bar, { height: 4 + l * 16 }]} />
            ))}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stop listening"
          onPress={onStop}
          disabled={state === 'stopping' || state === 'connecting'}
          style={({ pressed }) => [styles.stop, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.stopSquare} />
        </Pressable>
      </View>
    </View>
  );
}

/** Dock replacement when the connection drops or speech fails. */
export function DockError({ error, onRetry, onDismiss }: { error: NonNullable<VoiceError>; onRetry: () => void; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
      <View style={styles.err} accessibilityRole="alert">
        <Icon name="wifiOff" color="#F49A8F" size={22} />
        <View style={{ flex: 1, gap: 4 }}>
          <T style={styles.errTitle}>{error.kind === 'model' ? 'Form update failed' : error.kind === 'speech' ? 'Speech recognition stopped' : 'Connection lost'}</T>
          <T style={styles.errText}>{error.message}</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Close" variant="ghost" onPress={onDismiss} style={{ backgroundColor: colors.dockButton }} />
        <Button title="Retry now" onPress={onRetry} style={{ flex: 1, backgroundColor: '#FFFFFF' }} variant="quiet" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.dock, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 20, paddingHorizontal: 20, gap: 14 },
  transcript: { color: colors.dockMuted, fontSize: 17, lineHeight: 24 },
  latest: { color: '#FFFFFF', fontFamily: fonts.medium, fontSize: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  status: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: colors.dockText, fontSize: 13 },
  timer: { color: '#8A9096', fontSize: 13, fontFamily: fonts.mono },
  levels: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto', height: 20 },
  bar: { width: 3, borderRadius: 2, backgroundColor: colors.amber },
  stop: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.redRecord, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 20, height: 20, borderRadius: 5, backgroundColor: '#FFFFFF' },
  err: { flexDirection: 'row', gap: 12, backgroundColor: '#3A1D1A', borderRadius: 16, padding: 14 },
  errTitle: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 15 },
  errText: { color: '#E3C4BF', fontSize: 14, lineHeight: 20 },
});
