import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";

export type GeocodeResult = {
  lat: number | null;
  lng: number | null;
  error?: string;
};

// Server-side Google Geocoding for Server Components and Server Actions.
// The key is the public Maps key; this module itself has no browser use.
//
// It never throws for a transport problem. The location pages render around
// a "no coordinates" result already (an address Google cannot resolve), and
// a slow or unreachable Google must degrade to that same state rather than
// take the whole page down through the error boundary — which is what an
// uncaught deadline from fetchWithTimeout would do.
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!address) throw new Error("Address is required");

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Missing Google Maps API Key");

  try {
    const res = await fetchWithTimeout(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        address,
      )}&key=${apiKey}`,
      // Addresses are effectively immutable once set — cache resolved
      // coordinates for a week instead of re-billing/re-fetching on every
      // request. `next` is Next.js's fetch extension; it passes through
      // untouched, and Next drops the abort signal on background
      // revalidation so the cache still applies.
      {
        timeoutMs: HTTP_TIMEOUTS.googleGeocode,
        next: { revalidate: 60 * 60 * 24 * 7 },
      } as Parameters<typeof fetchWithTimeout>[1],
    );

    const data = await res.json();

    if (data.status === "OK") {
      const location = data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    }

    return { lat: null, lng: null, error: "Location not found" };
  } catch (error) {
    logger.warn(`Geocoding "${address}" failed`, error);
    return { lat: null, lng: null, error: "Location lookup unavailable" };
  }
}
