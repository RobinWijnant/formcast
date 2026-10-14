import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const C = 2 * Math.PI * 10;

/** Shrinking ring until a proposal fills in. Tapping it rejects the proposal. */
export function CountdownRing({ startedAt, duration, onReject, label }: { startedAt: number; duration: number; onReject: () => void; label: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const elapsed = Math.min(duration, Math.max(0, Date.now() - startedAt));
    progress.value = elapsed / duration;
    progress.value = withTiming(1, { duration: duration - elapsed, easing: Easing.linear });
    return () => cancelAnimation(progress);
  }, [startedAt, duration, progress]);

  const props = useAnimatedProps(() => ({ strokeDashoffset: C * progress.value }));

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onReject} hitSlop={8} style={{ width: 44, height: 44, marginRight: -10, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={28} height={28} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={10} fill="none" stroke={colors.amberRingTrack} strokeWidth={2.5} />
        <AnimatedCircle
          cx={12}
          cy={12}
          r={10}
          fill="none"
          stroke={colors.amberRing}
          strokeWidth={2.5}
          strokeDasharray={C}
          strokeLinecap="round"
          transform="rotate(-90 12 12)"
          animatedProps={props}
        />
        <Path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke="#7A4A05" strokeWidth={1.75} strokeLinecap="round" />
      </Svg>
    </Pressable>
  );
}
