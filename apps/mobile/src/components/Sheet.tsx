import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '@/lib/theme';
import { T } from './ui';

/** Bottom sheet with a dimmed backdrop. */
export function Sheet({ visible, onClose, title, body, children }: { visible: boolean; onClose: () => void; title: string; body?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 18 }]}>
        <View style={styles.handle} />
        <View style={{ gap: 6 }}>
          <T style={styles.title}>{title}</T>
          {body ? <T style={styles.body}>{body}</T> : null}
        </View>
        <View style={{ gap: 10 }}>{children}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22,24,26,0.48)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, paddingHorizontal: 20, gap: 18 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#D5D8D3' },
  title: { fontFamily: fonts.semibold, fontSize: 22, letterSpacing: -0.4 },
  body: { fontSize: 15, lineHeight: 22, color: colors.textMuted },
});
