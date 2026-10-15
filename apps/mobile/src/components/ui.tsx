import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { colors, fonts, PRIORITY_TONE, radius } from '@/lib/theme';
import { Icon, type IconName } from './Icon';

export function T({ style, children, numberOfLines, accessibilityRole }: { style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; accessibilityRole?: 'alert' | 'header' }) {
  return (
    <Text style={[styles.text, style]} numberOfLines={numberOfLines} accessibilityRole={accessibilityRole}>
      {children}
    </Text>
  );
}

export function IconButton({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      <Icon name={icon} />
    </Pressable>
  );
}

type Variant = 'dark' | 'amber' | 'danger' | 'quiet' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'dark',
  icon,
  loading,
  disabled,
  style,
  big,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  big?: boolean;
}) {
  const v = variants[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, big && styles.buttonBig, { backgroundColor: v.bg }, pressed && styles.pressed, style]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Icon name={icon} color={v.fg} size={big ? 26 : 20} strokeWidth={big ? 2 : 1.75} />}
          <Text style={[styles.buttonText, big && styles.buttonTextBig, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const variants: Record<Variant, { bg: string; fg: string }> = {
  dark: { bg: colors.ink, fg: colors.onInk },
  amber: { bg: colors.amber, fg: colors.amberButtonText },
  danger: { bg: colors.red, fg: colors.onInk },
  quiet: { bg: colors.ground, fg: colors.ink },
  ghost: { bg: 'transparent', fg: colors.text },
};

export function Pill({ children, tone = 'neutral', style }: { children: ReactNode; tone?: 'neutral' | 'muted' | 'low' | 'medium' | 'high'; style?: StyleProp<ViewStyle> }) {
  const p = PRIORITY_TONE[tone];
  return (
    <View style={[styles.pill, p && { backgroundColor: p.bg }, tone === 'muted' && styles.pillMuted, style]}>
      <T style={[styles.pillText, p && { color: p.fg }, tone === 'muted' && { color: colors.textFaint, fontFamily: fonts.regular }]}>{children}</T>
    </View>
  );
}

export function SectionHeader({ title, right }: { title: string; right?: string | null }) {
  return (
    <View style={styles.section}>
      <T style={styles.sectionText}>{title}</T>
      {right ? <T style={styles.sectionText}>{right}</T> : null}
    </View>
  );
}

export const Card = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[styles.card, style]}>{children}</View>;

export const styles = StyleSheet.create({
  text: { fontFamily: fonts.regular, color: colors.ink, fontSize: 15 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75 },
  button: { height: 54, borderRadius: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 22 },
  buttonBig: { height: 72, borderRadius: 36 },
  buttonText: { fontFamily: fonts.semibold, fontSize: 16 },
  buttonTextBig: { fontSize: 19 },
  pill: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.chip, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillMuted: { backgroundColor: 'transparent', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed },
  pillText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  section: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, marginTop: 20, marginBottom: 8 },
  sectionText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textMuted },
  card: { marginHorizontal: 16, backgroundColor: colors.surface, borderRadius: radius.card, padding: 4, gap: 2 },
});
