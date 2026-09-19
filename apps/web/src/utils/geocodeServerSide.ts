import {
  HTTP_TIMEOUTS,
  fetchWithTimeout,
} from "@abonten/core/http/fetchWithTimeout";

// Server-side Google Geocoding for Server Components and Server Actions.
// The key is the public Maps key; this module itself has no browser use.
export async function geocodeAddress(address: string) {
  if (!address) throw new Error("Address is required");

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Missing Google Maps API Key");

  const res = await fetchWithTimeout(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address,
    )}&key=${apiKey}`,
    // Addresses are effectively immutable once set — cache resolved
    // coordinates for a week instead of re-billing/re-fetching on every request.
    // `next` is Next.js's fetch extension; it passes through untouched.
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

  // throw new Error(data.status || "Geocoding failed");
}
