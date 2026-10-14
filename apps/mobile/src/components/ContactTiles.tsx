import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import type { ClientDto } from '@formcast/shared';
import { colors, fonts } from '@/lib/theme';
import { Icon } from './Icon';
import { MapBackground } from './MapBackground';
import { T } from './ui';

function openDirections(client: ClientDto) {
  const address = encodeURIComponent(`${client.address}, ${client.city}`);
  const url = Platform.OS === 'ios' ? `maps://?daddr=${address}` : `https://maps.apple.com/?daddr=${address}`;
  void Linking.openURL(url).catch(() => Linking.openURL(`https://maps.apple.com/?daddr=${address}`));
}

/** Map tile (opens directions) and a glass phone tile (calls the contact). */
export function ContactTiles({ client, eta }: { client: ClientDto; eta: string }) {
  return (
    <View style={styles.duo}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open route to ${client.address} in Maps, ${eta}`}
        onPress={() => openDirections(client)}
        style={styles.tile}
      >
        <MapBackground lat={client.lat} lng={client.lng} />
        <View style={styles.chip}>
          <Icon name="navigate" size={13} strokeWidth={2} />
          <T style={styles.chipText}>{eta}</T>
        </View>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Call ${client.contactName}, ${client.phone}`}
        onPress={() => void Linking.openURL(`tel:${client.phone.replace(/\s/g, '')}`)}
        style={styles.tile}
      >
        <MapBackground lat={client.lat + 0.004} lng={client.lng + 0.006} pin={false} />
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.glass} />
        <View style={styles.phone}>
          <View style={styles.phoneIcon}>
            <Icon name="phone" size={16} color={colors.text} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }} />
          <T style={styles.contact}>{client.contactName}</T>
          <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {client.phone}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  duo: { flexDirection: 'row', gap: 8, height: 132 },
  tile: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#E7EAE3' },
  chip: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  chipText: { fontFamily: fonts.semibold, fontSize: 13 },
  glass: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(255,255,255,0.62)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  phone: { ...StyleSheet.absoluteFill, padding: 12, gap: 2 },
  phoneIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(22,24,26,0.07)', alignItems: 'center', justifyContent: 'center' },
  contact: { fontSize: 13, color: colors.textMuted },
  number: { fontFamily: fonts.semibold, fontSize: 15, letterSpacing: -0.3, color: colors.ink, fontVariant: ['tabular-nums'] },
});
