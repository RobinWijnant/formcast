import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '@/lib/theme';

/** Web has no native map view; a drawn street map stands in. */
export function MapBackground({ pin = true }: { lat: number; lng: number; pin?: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 326 132" preserveAspectRatio="xMidYMid slice">
        <Rect width={326} height={132} fill={colors.mapLand} />
        <Rect x={210} y={0} width={116} height={52} fill={colors.mapPark} />
        <Path d="M0 92 L326 70" stroke={colors.mapRoad} strokeWidth={12} />
        <Path d="M120 0 L150 132" stroke={colors.mapRoad} strokeWidth={9} />
        <Path d="M0 30 L326 40" stroke={colors.mapRoad} strokeWidth={6} />
        <Path d="M250 0 L236 132" stroke={colors.mapRoad} strokeWidth={6} />
        <Path d="M40 132 L70 0" stroke={colors.mapRoad} strokeWidth={4} />
        {pin ? (
          <>
            <Path d="M163 70 c-10-12-14-18-14-24 a14 14 0 0 1 28 0 c0 6-4 12-14 24z" fill={colors.mapPin} />
            <Circle cx={163} cy={46} r={5} fill={colors.surface} />
          </>
        ) : null}
      </Svg>
    </View>
  );
}
