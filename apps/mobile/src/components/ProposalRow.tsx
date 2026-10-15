import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { usePrefs } from '@/lib/prefs';
import { colors, fonts, radius } from '@/lib/theme';
import { FILL_FLASH_MS, type FillStage } from '@/voice/drafts';
import { CountdownRing } from './CountdownRing';
import { Icon } from './Icon';
import { useRowRegistry } from './rowRegistry';
import { T } from './ui';

/**
 * Row states, see the "Proposal lifecycle" spec in the designs:
 * - committed: saved value, neutral
 * - pending: just heard; amber, dashed, countdown ring (tap to reject)
 * - incomplete: heard but missing a required column; no timer
 * - removing: a committed value or row that will be cleared/deleted
 * - ghost: a dropped proposal fading out
 * After the countdown a pending row "fills": green sweep, pop, a hold, back to
 * neutral with a check that stays until Save. The drafts store owns the timing
 * (`stage`); this row only animates it.
 */
export type RowKind = 'committed' | 'pending' | 'incomplete' | 'removing' | 'ghost';

const SWEEP_MS = 140;
const FADE_MS = 400;
const HOLD_MS = FILL_FLASH_MS - SWEEP_MS - FADE_MS;
const SHINE_WIDTH = 110;

export function ProposalRow({
  kind,
  label,
  sublabel,
  value,
  previous,
  badge,
  stage,
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
  /** Fill stage of the pending op; undefined once settled. */
  stage?: FillStage;
  /** Start of the countdown, for the ring. */
  changedAt?: number;
  onReject?: () => void;
  tall?: boolean;
}) {
  const registry = useRowRegistry();
  const delay = usePrefs((s) => s.fillDelayMs);
  const vibrate = usePrefs((s) => s.vibrateOnFill);
  const timed = kind === 'pending' || kind === 'removing';
  const phase = timed ? stage : undefined;

  const sweep = useSharedValue(0);
  const flash = useSharedValue(0);
  const scale = useSharedValue(1);
  const shine = useSharedValue(0);
  const rowWidth = useSharedValue(0);
  const ghost = useSharedValue(1);

  // Starts once the row has re-rendered without its amber look, so the green
  // never sweeps in under the dashed border and ring.
  useEffect(() => {
    if (phase !== 'flash') {
      sweep.set(0);
      flash.set(0);
      shine.set(0);
      return;
    }
    if (vibrate) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    // Green sweeps in with the check, the card pops like a stamp while a sheen
    // passes left to right, then it holds and fades.
    sweep.set(withTiming(1, { duration: SWEEP_MS, easing: Easing.out(Easing.cubic) }));
    shine.set(withDelay(80, withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) })));
    flash.set(withSequence(withTiming(1, { duration: SWEEP_MS }), withDelay(HOLD_MS, withTiming(0, { duration: FADE_MS }))));
    scale.set(
      withSequence(
        withTiming(1.04, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(0.99, { duration: 120, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [phase, vibrate, sweep, flash, shine, scale]);

  useEffect(() => {
    if (kind === 'ghost') ghost.set(withTiming(0, { duration: 1100 }));
  }, [kind, ghost]);

  const containerStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: kind === 'ghost' ? 0.15 + ghost.value * 0.45 : 1 }));
  // Slid in rather than sized: a % width fell short of the right edge on iOS.
  const overlayStyle = useAnimatedStyle(() => ({ opacity: flash.value, transform: [{ translateX: (sweep.value - 1) * rowWidth.value }] }));
  const shineStyle = useAnimatedStyle(() => ({
    opacity: shine.value > 0 && shine.value < 1 ? 1 : 0,
    transform: [{ translateX: -SHINE_WIDTH + shine.value * (rowWidth.value + SHINE_WIDTH) }, { skewX: '-20deg' }],
  }));

  const heard = phase === 'heard';
  const removing = kind === 'removing';
  const tone = heard ? (removing ? 'red' : 'amber') : kind === 'incomplete' ? 'amber' : null;
  const textColor = tone === 'amber' ? colors.amberText : tone === 'red' ? colors.redText : colors.text;
  const valueColor = tone === 'amber' ? colors.amberText : tone === 'red' ? colors.redText : colors.ink;
  const struck = kind === 'ghost' || removing;
  const showCheck = timed && !heard;

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
      onLayout={(e) => rowWidth.set(e.nativeEvent.layout.width)}
    >
      <Animated.View pointerEvents="none" style={[styles.overlay, overlayStyle]} />
      {phase === 'flash' ? (
        <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]}>
          <Svg width={SHINE_WIDTH} height="100%">
            <Defs>
              <LinearGradient id="shine" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.shine} stopOpacity={0} />
                <Stop offset="0.5" stopColor={colors.shine} stopOpacity={0.85} />
                <Stop offset="1" stopColor={colors.shine} stopOpacity={0} />
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
          <T style={[styles.badgeText, kind === 'ghost' || kind === 'incomplete' ? { color: colors.badgeGrayText } : removing && heard ? { color: colors.badgeRedText } : null]}>{badge}</T>
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
  previous: { fontFamily: fonts.mono, fontSize: 13, color: colors.amberPrevious, textDecorationLine: 'line-through' },
  struck: { textDecorationLine: 'line-through' },
  badge: { backgroundColor: colors.amber, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeGray: { backgroundColor: colors.badgeGray },
  badgeRed: { backgroundColor: colors.badgeRed },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.5, color: colors.amberInk, textTransform: 'uppercase' },
});
