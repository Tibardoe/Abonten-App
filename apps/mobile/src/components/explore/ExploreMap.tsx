import {
  MapErrorBoundary,
  MapView,
  Marker,
  PROVIDER_GOOGLE,
} from "@/components/map/NativeMap";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import type { PlaceType } from "@abonten/types/placeType";
import type { UserPostType } from "@abonten/types/postsType";
import { EmptyState } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Platform, View } from "react-native";

// Native echo of the web EventsMapView / PlacesMapView: the Explore list
// rendered as pins instead. Same data (the current tab's filtered rows),
// same WKB-hex location parsing (`parseWKBHex`), tap a pin to open the
// detail screen.

type Kind = "events" | "places";

function pointOf(row: { location?: string | null }): {
  lat: number;
  lng: number;
} | null {
  if (!row.location) return null;
  try {
    const { eventLat, eventLng } = parseWKBHex(row.location);
    if (!Number.isFinite(eventLat) || !Number.isFinite(eventLng)) return null;
    return { lat: eventLat, lng: eventLng };
  } catch {
    return null;
  }
}

export function ExploreMap({
  kind,
  events,
  places,
  center,
}: {
  kind: Kind;
  events: UserPostType[];
  places: PlaceType[];
  center: { lat: number; lng: number } | null;
}) {
  const router = useRouter();

  const markers = useMemo(() => {
    const rows =
      kind === "events"
        ? events.map((e) => ({
            id: e.id,
            title: e.title,
            point: pointOf(e as unknown as { location?: string }),
          }))
        : places.map((p) => ({
            id: p.id,
            title: p.name,
            point: pointOf(p as unknown as { location?: string }),
          }));
    return rows.filter(
      (
        r,
      ): r is {
        id: string;
        title: string;
        point: { lat: number; lng: number };
      } => r.point != null,
    );
  }, [kind, events, places]);

  if (markers.length === 0) {
    return (
      <EmptyState
        icon="map-outline"
        title={`No ${kind} to map here`}
        description="Switch back to the list, or widen your filters."
      />
    );
  }

  const region = {
    latitude: center?.lat ?? markers[0].point.lat,
    longitude: center?.lng ?? markers[0].point.lng,
    latitudeDelta: 0.15,
    longitudeDelta: 0.15,
  };

  return (
    <MapErrorBoundary>
      <View className="flex-1">
        <MapView
          style={{ flex: 1 }}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          initialRegion={region}
          showsUserLocation
        >
          {markers.map((m) => (
            <Marker
              key={m.id}
              coordinate={{ latitude: m.point.lat, longitude: m.point.lng }}
              title={m.title}
              onCalloutPress={() =>
                router.push(
                  kind === "events"
                    ? `/(app)/event/${m.id}`
                    : `/(app)/place/${m.id}`,
                )
              }
            />
          ))}
        </MapView>
      </View>
    </MapErrorBoundary>
  );
}
