import {
  MapConfigured,
  MapErrorBoundary,
  MapView,
  PROVIDER_GOOGLE,
} from "@/components/map/NativeMap";
import {
  labelForCoords,
  useExploreLocation,
} from "@/features/discovery/ExploreLocationProvider";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { useRef, useState } from "react";
import { Modal, Platform, Pressable, View } from "react-native";

// Native echo of the web MapModal / MapPicker: a full-screen map with a
// fixed centre pin. Pan the map under the pin, then "Use this location"
// commits the centre coordinate. Default target is the Explore location
// (ExploreLocationProvider); pass `onPick` to reuse it for another form
// (e.g. place creation), which gets the point + a reverse-geocoded label
// and the provider is left untouched. Wrapped in MapErrorBoundary so a
// stale binary shows a message instead of crashing.

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
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  initial: { lat: number; lng: number } | null;
  /** When set, the chosen point is handed here instead of the Explore
   *  location. */
  onPick?: (loc: {
    lat: number;
    lng: number;
    label: string;
  }) => void | Promise<void>;
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
    const { lat, lng } = centerRef.current;
    if (onPick) {
      const label = await labelForCoords(lat, lng);
      await onPick({ lat, lng, label });
    } else {
      await setPickedLocation(lat, lng);
    }
    setBusy(false);
    onClose();
  }

  // A Google-provider MapView hard-crashes at native view-attach when the
  // Maps API key isn't baked into the installed binary — an error a JS
  // boundary can't catch. So when maps aren't configured, never mount one:
  // show a message instead (the calling screen still has address search +
  // "use current location").
  const header = (
    <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
      <Pressable onPress={onClose} hitSlop={10}>
        <Icon name="close" size={24} tone="foreground" />
      </Pressable>
      <AppText variant="bodyStrong">Choose on map</AppText>
    </View>
  );

  if (!MapConfigured) {
    return (
      <Modal visible={open} animationType="slide" onRequestClose={onClose}>
        <View className="flex-1 bg-background">
          {header}
          <View className="flex-1 items-center justify-center gap-2 p-8">
            <Icon name="map-outline" size={32} tone="muted" />
            <AppText variant="bodyStrong">Map picker unavailable</AppText>
            <AppText variant="muted" className="text-center">
              This build doesn't have maps enabled. Search for the address or
              use your current location instead.
            </AppText>
            <View className="pt-2">
              <Button title="Close" variant="outline" onPress={onClose} />
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <MapErrorBoundary>
        <View className="flex-1 bg-background">
          {header}

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
