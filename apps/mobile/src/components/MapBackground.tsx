import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

/** Static, non-interactive map (Apple Maps on iOS, no API key needed). */
export function MapBackground({ lat, lng, pin = true }: { lat: number; lng: number; pin?: boolean }) {
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
      showsPointsOfInterests={false}
      initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
    >
      {pin ? <Marker coordinate={{ latitude: lat, longitude: lng }} pinColor="#E5483A" /> : null}
    </MapView>
  );
}
