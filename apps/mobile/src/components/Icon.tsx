import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/lib/theme';

const paths = {
  back: <Path d="M15 18l-6-6 6-6" />,
  chevron: <Path d="M9 6l6 6-6 6" />,
  mic: (
    <>
      <Rect x={9} y={3} width={6} height={11} rx={3} />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  micOff: (
    <>
      <Rect x={9} y={3} width={6} height={11} rx={3} />
      <Path d="M5 11a7 7 0 0 0 14 0M12 18v3M3 3l18 18" />
    </>
  ),
  check: <Path d="M5 12l5 5 9-10" />,
  user: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  phone: <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  navigate: <Path d="M3 11l18-8-8 18-2-8-8-2z" />,
  info: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 11v5M12 8h.01" />
    </>
  ),
  play: <Path d="M7 4l13 8-13 8z" />,
  car: <Path d="M5 17h14M6 17l1.5-5h9L18 17M7 17v2M17 17v2M8 9l1-3h6l1 3" />,
  wifiOff: <Path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2.5-1.8M2 9.5a15 15 0 0 1 4.5-2.8M22 9.5A15 15 0 0 0 12 5.5M12 20h.01" />,
  x: <Path d="M6 6l12 12M18 6L6 18" />,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, color = colors.ink, strokeWidth = 1.75 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </Svg>
  );
}
