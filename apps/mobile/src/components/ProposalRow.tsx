import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRowRegistry } from './rowRegistry';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { usePrefs } from '@/lib/prefs';
import { colors, fonts, radius } from '@/lib/theme';
import { CountdownRing } from './CountdownRing';
import { Icon } from './Icon';
import { T } from './ui';

/**
 * Row states, see the "Proposal lifecycle" spec in the designs:
 * - committed: saved value, neutral
 * - pending: just heard; amber, dashed, countdown ring (tap to reject)
 * - incomplete: heard but missing a required column; no timer
 * - removing: a committed value or row that will be cleared/deleted
 * - ghost: a dropped proposal fading out
 * After the timer a pending row "fills": green sweep, pop, 1 s hold, back to
 * neutral with a check that stays until Save.
 */
export type RowKind = 'committed' | 'pending' | 'incomplete' | 'removing' | 'ghost';

type Phase = 'heard' | 'flash' | 'filled';

const FLASH_HOLD_MS = 1000;
const SHINE_WIDTH = 110;

export function ProposalRow({
  kind,
  label,
  sublabel,
  value,
  previous,
  badge,
  changedAt = 0,
  onReject,
  tall,
  rowKey,
  onPress,
  editLabel,
}: {
  /** Tap to edit by hand. */
  onPress?: () => void;
  editLabel?: string;
  rowKey?: string;
  kind: RowKind;
  label: ReactNode;
  sublabel?: ReactNode;
  value?: string;
  /** Committed value being replaced, shown struck through. */
  previous?: string;
  badge?: string;
  changedAt?: number;
  onReject?: () => void;
  tall?: boolean;
}) {
  const registry = useRowRegistry();
  const delay = usePrefs((s) => s.fillDelayMs);
  const vibrate = usePrefs((s) => s.vibrateOnFill);
  const timed = kind === 'pending' || kind === 'removing';
  const settleAt = changedAt + delay;
  const [phase, setPhase] = useState<Phase>(() => (!timed ? 'filled' : Date.now() >= settleAt ? 'filled' : 'heard'));

  const sweep = useSharedValue(phase === 'filled' ? 1 : 0);
  const flash = useSharedValue(0);
  const scale = useSharedValue(1);
  const shine = useSharedValue(0);
  const rowWidth = useSharedValue(0);
  const ghost = useSharedValue(1);

  useEffect(() => {
    if (!timed) {
      setPhase('filled');
      return;
    }
    const wait = settleAt - Date.now();
    if (wait <= 0) {
      setPhase('filled');
      return;
    }
    setPhase('heard');
    sweep.value = 0;
    flash.value = 0;
    shine.value = 0;
    const timer = setTimeout(() => setPhase('flash'), wait);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timed, settleAt]);

  // Runs once the row has re-rendered without its amber look, so the green
  // never sweeps in under the dashed border and ring.
  useEffect(() => {
    if (phase !== 'flash') return;
    if (vibrate) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    // Green sweeps in with the check, the card pops like a stamp while a sheen
    // passes left to right, then it holds and fades.
    sweep.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.cubic) });
    shine.value = withDelay(80, withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }));
    flash.value = withSequence(withTiming(1, { duration: 140 }), withDelay(FLASH_HOLD_MS, withTiming(0, { duration: 400 })));
    scale.value = withSequence(
      withTiming(1.04, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(0.99, { duration: 120, easing: Easing.inOut(Easing.quad) }),
      withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
    );
    const done = setTimeout(() => setPhase('filled'), 140 + FLASH_HOLD_MS + 400);
    return () => clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (kind === 'ghost') ghost.value = withTiming(0, { duration: 1100 });
  }, [kind, ghost]);

  const containerStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: kind === 'ghost' ? 0.15 + ghost.value * 0.45 : 1 }));
  // Slid in rather than sized: a % width fell short of the right edge on iOS.
  const overlayStyle = useAnimatedStyle(() => ({ opacity: flash.value, transform: [{ translateX: (sweep.value - 1) * rowWidth.value }] }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: shine.value > 0 && shine.value < 1 ? 1 : 0,
    transform: [{ translateX: -SHINE_WIDTH + shine.value * (rowWidth.value + SHINE_WIDTH) }, { skewX: '-20deg' }],
  }));

  const heard = phase === 'heard' && timed;
  const removing = kind === 'removing';
  const tone = heard ? (removing ? 'red' : 'amber') : kind === 'incomplete' ? 'amber' : null;
  const textColor = tone === 'amber' ? colors.amberText : tone === 'red' ? colors.redText : colors.text;
  const valueColor = tone === 'amber' ? colors.amberText : tone === 'red' ? colors.redText : colors.ink;
  const struck = kind === 'ghost' || removing;
  const showCheck = timed && phase !== 'heard';

  return (
    <Pressable
      collapsable={false}
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? editLabel : undefined}
      style={({ pressed }) => (pressed && onPress ? { opacity: 0.6 } : null)}
      ref={(node) => {
        if (!rowKey || !registry) return;
        if (node) registry.set(rowKey, node as unknown as View);
        else registry.delete(rowKey);
      }}
    >
    <Animated.View
      style={[
        styles.row,
        tall && styles.tall,
        tone === 'amber' && styles.amber,
        tone === 'red' && styles.red,
        phase === 'flash' && styles.flash,
        containerStyle,
      ]}
      onLayout={(e) => (rowWidth.value = e.nativeEvent.layout.width)}
    >
      <Animated.View pointerEvents="none" style={[styles.overlay, overlayStyle]} />
      {phase === 'flash' ? (
        <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]}>
          <Svg width={SHINE_WIDTH} height="100%">
            <Defs>
              <LinearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.85} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#shine)" />
          </Svg>
        </Animated.View>
      ) : null}
      <View style={styles.labels}>
        <T style={[styles.label, { color: textColor }, struck && styles.struck]}>{label}</T>
        {sublabel ? <T style={[styles.sublabel, { color: tone ? textColor : colors.textMuted }, struck && styles.struck]}>{sublabel}</T> : null}
      </View>
      {value !== undefined && (
        <T style={[styles.value, { color: value === '—' ? colors.empty : valueColor }, (heard || kind === 'incomplete') && styles.valueStrong, struck && styles.struck]}>
          {previous ? <T style={styles.previous}>{previous} </T> : null}
          {value}
        </T>
      )}
      {badge && (heard || kind === 'incomplete' || kind === 'ghost') ? (
        <View style={[styles.badge, kind === 'ghost' || kind === 'incomplete' ? styles.badgeGray : removing && heard ? styles.badgeRed : null]}>
          <T style={[styles.badgeText, kind === 'ghost' || kind === 'incomplete' ? { color: '#4A4F54' } : removing && heard ? { color: '#5A1308' } : null]}>{badge}</T>
        </View>
      ) : null}
      {heard && onReject ? <CountdownRing startedAt={changedAt} duration={delay} onReject={onReject} label="Reject this change" /> : null}
      {showCheck ? <Icon name="check" size={18} color={colors.green} strokeWidth={2} /> : null}
    </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderRadius: radius.row,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  tall: { minHeight: 58, paddingVertical: 6 },
  amber: { backgroundColor: colors.amberFill, borderColor: colors.amberBorder },
  red: { backgroundColor: colors.redFill, borderColor: colors.redBorder },
  flash: { borderStyle: 'solid', borderColor: colors.greenBorder },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.greenFill },
  shine: { position: 'absolute', left: 0, top: -8, bottom: -8, width: SHINE_WIDTH },
  labels: { flex: 1, gap: 2 },
  label: { fontSize: 15 },
  sublabel: { fontFamily: fonts.mono, fontSize: 13 },
  value: { fontFamily: fonts.mono, fontSize: 15, textAlign: 'right', flexShrink: 1 },
  valueStrong: { fontFamily: fonts.monoMedium },
  previous: { fontFamily: fonts.mono, fontSize: 13, color: '#8A6A3A', textDecorationLine: 'line-through' },
  struck: { textDecorationLine: 'line-through' },
  badge: { backgroundColor: colors.amber, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeGray: { backgroundColor: '#E3E5E0' },
  badgeRed: { backgroundColor: '#F2ADA3' },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.5, color: colors.amberInk, textTransform: 'uppercase' },
});
