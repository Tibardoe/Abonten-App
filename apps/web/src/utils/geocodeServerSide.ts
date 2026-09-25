import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";
import { logger } from "@abonten/core/logger";
import {
  type GeocodeLookup,
  geocodePlaceName,
} from "@abonten/services/geo/placeNameGeocode";
import { headers } from "next/headers";

export type GeocodeResult = {
  lat: number | null;
  lng: number | null;
  error?: string;
};

// Server-side Google Geocoding for the public location pages. The key is the
// public Maps key; this module itself has no browser use.
//
// These pages take any text in the URL, so Google is the last resort:
// @abonten/services/geo/placeNameGeocode answers market cities and cached
// names first and spends a per-address and global hourly budget on the
// rest.
//
// It never throws for a transport problem. The location pages render around
// a "no coordinates" result already (an address Google cannot resolve), and
// a slow or unreachable Google must degrade to that same state rather than
// take the whole page down through the error boundary — which is what an
// uncaught deadline from fetchWithTimeout would do.
const googleLookup: GeocodeLookup = async (query) => {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    logger.error("geocodeAddress: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set");
    return "unavailable";
  }
  try {
    const res = await fetchWithTimeout(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        query,
      )}&key=${apiKey}`,
      { timeoutMs: HTTP_TIMEOUTS.googleGeocode, cache: "no-store" },
    );
    const data = await res.json();
    if (data.status === "OK") {
      const location = data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    }
    // ZERO_RESULTS is an answer; quota and key errors are not.
    return data.status === "ZERO_RESULTS" ? "not_found" : "unavailable";
  } catch (error) {
    logger.warn(`Geocoding "${query}" failed`, error);
    return "unavailable";
  }
};

async function callerIp(): Promise<string | null> {
  try {
    const forwardedFor = (await headers()).get("x-forwarded-for");
    return forwardedFor?.split(",")[0]?.trim() || null;
  } catch {
    return null;
  }
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  try {
    return await geocodePlaceName({
      query: address ?? "",
      ipAddress: await callerIp(),
      lookup: googleLookup,
    });
  } catch (error) {
    logger.warn(`Geocoding "${address}" failed`, error);
    return { lat: null, lng: null, error: "Location lookup unavailable" };
  }
}
