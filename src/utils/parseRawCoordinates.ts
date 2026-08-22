// Detects a raw "lat,lng" (or "lat, lng") coordinate pair typed directly
// into a location input, e.g. "5.6037, -0.1870". Google's Places
// Autocomplete predictions API is built for place-name text and doesn't
// reliably handle bare coordinates, so callers resolving this shape should
// reverse-geocode it directly instead.
const RAW_COORDS_PATTERN =
  /^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/;

export function parseRawCoordinates(
  text: string,
): { lat: number; lng: number } | null {
  const match = text.trim().match(RAW_COORDS_PATTERN);
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { lat, lng };
}
