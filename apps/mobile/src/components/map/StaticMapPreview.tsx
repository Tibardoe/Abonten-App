import {
  MapConfigured,
  MapErrorBoundary,
  MapView,
  Marker,
  PROVIDER_GOOGLE,
} from "@/components/map/NativeMap";
import { AppText, Icon } from "@abonten/ui-native";
import { Platform, Pressable, View } from "react-native";

// The small, non-interactive location map on the event and place detail
// screens. Tapping it opens directions in the phone's maps app — the map
// itself never takes a gesture.
//
// Why this is its own component, and why `pointerEvents` is NEVER set on the
// MapView itself:
//
// On iOS (new architecture) native views are recycled. When this preview
// unmounted, its RNMapsMapView went back to the pool with UIKit's
// `userInteractionEnabled = NO` (that is what `pointerEvents="none"` on the
// view sets). The next MapView to mount — the Explore map, or the "Choose on
// map" picker — could receive that recycled view. react-native-maps resets
// its cached props to defaults in `prepareMapView`, so React Native's
// `pointerEvents` diff saw "auto → auto", never re-enabled interaction, and
// the map drew perfectly but ignored every pan, zoom and marker tap until a
// tab switch happened to create a fresh view. (RNMapsMapView.mm
// `prepareMapView` + RCTViewComponentView `updateProps`.)
//
// So touch blocking lives on a plain wrapper View, which recycles correctly,
// and the map only gets the gesture props (scroll/zoom/rotate/pitch off),
// which a fresh AIRMap resets to their defaults on reuse. On Android, lite
// mode renders a static bitmap that registers no gesture recognisers.

export function StaticMapPreview({
  coords,
  label,
  onPress,
  height = 160,
}: {
  coords: { lat: number; lng: number };
  /** Read by screen readers: "Open directions to <label>". */
  label: string;
  onPress: () => void;
  height?: number;
}) {
  if (!MapConfigured || !MapView) return null;

  return (
    <MapErrorBoundary fallback={null}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open directions to ${label}`}
        onPress={onPress}
        className="overflow-hidden rounded-xl border border-border active:opacity-90"
        style={{ height }}
      >
        <View pointerEvents="none" style={{ flex: 1 }}>
          <MapView
            style={{ flex: 1 }}
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
            liteMode={Platform.OS === "android"}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            showsPointsOfInterests={false}
            initialRegion={{
              latitude: coords.lat,
              longitude: coords.lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
          >
            {Marker ? (
              <Marker
                coordinate={{ latitude: coords.lat, longitude: coords.lng }}
              />
            ) : null}
          </MapView>
        </View>
        {/* Affordance: says the preview opens something, on both themes. */}
        <View
          pointerEvents="none"
          className="absolute bottom-2 right-2 flex-row items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1"
        >
          <Icon name="expand-outline" size={13} tone="foreground" />
          <AppText variant="caption" className="font-semibold">
            Open in Maps
          </AppText>
        </View>
      </Pressable>
    </MapErrorBoundary>
  );
}
