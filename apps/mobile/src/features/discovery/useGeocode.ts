import { useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";

// Forward-geocode a free-text address to coordinates. The web event/place
// detail pages do this server-side (geocodeAddress) to feed the map preview
// and the "similar events" radius query; on native we use expo-location's
// forward geocoder, which needs no location permission. If it's unavailable
// (older binary, offline, rate-limited) it resolves to null and the
// dependent UI (map preview, similar events) is simply omitted.

export type Coords = { lat: number; lng: number };

export function useGeocode(address: string | null | undefined) {
  const query = (address ?? "").trim();
  return useQuery<Coords | null>({
    queryKey: ["mobile", "geocode", query],
    enabled: query.length > 3,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    queryFn: async () => {
      try {
        const results = await Location.geocodeAsync(query);
        const first = results[0];
        return first ? { lat: first.latitude, lng: first.longitude } : null;
      } catch {
        return null;
      }
    },
  });
}
