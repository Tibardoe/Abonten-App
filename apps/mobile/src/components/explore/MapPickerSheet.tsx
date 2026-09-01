import {
  MapErrorBoundary,
  MapView,
  PROVIDER_GOOGLE,
} from "@/components/map/NativeMap";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { useRef, useState } from "react";
import { Modal, Platform, Pressable, View } from "react-native";

// Native echo of the web MapModal / MapPicker: a full-screen map with a
// fixed centre pin. Pan the map under the pin, then "Use this location"
// commits the centre coordinate through ExploreLocationProvider (which
// reverse-geocodes a label). Wrapped in MapErrorBoundary so a stale binary
// shows a message instead of crashing.

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export function MapPickerSheet({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: { lat: number; lng: number } | null;
}) {
  const { setPickedLocation } = useExploreLocation();
  const [busy, setBusy] = useState(false);
  const centerRef = useRef<{ lat: number; lng: number }>({
    lat: initial?.lat ?? 5.6037,
    lng: initial?.lng ?? -0.187,
  });

  const region: Region = {
    latitude: initial?.lat ?? 5.6037,
    longitude: initial?.lng ?? -0.187,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  async function confirm() {
    setBusy(true);
    await setPickedLocation(centerRef.current.lat, centerRef.current.lng);
    setBusy(false);
    onClose();
  }

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <MapErrorBoundary>
        <View className="flex-1 bg-background">
          <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
            <Pressable onPress={onClose} hitSlop={10}>
              <Icon name="close" size={24} tone="foreground" />
            </Pressable>
            <AppText variant="bodyStrong">Choose on map</AppText>
          </View>

          <View className="flex-1">
            <MapView
              style={{ flex: 1 }}
              provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
              initialRegion={region}
              onRegionChangeComplete={(r: Region) => {
                centerRef.current = { lat: r.latitude, lng: r.longitude };
              }}
              showsUserLocation
            />
            {/* Fixed centre pin. */}
            <View
              pointerEvents="none"
              className="absolute inset-0 items-center justify-center"
            >
              <Icon name="location" size={40} tone="primary" />
            </View>
          </View>

          <View className="border-t border-border p-4">
            <Button
              title={busy ? "Setting…" : "Use this location"}
              onPress={confirm}
              disabled={busy}
            />
          </View>
        </View>
      </MapErrorBoundary>
    </Modal>
  );
}
