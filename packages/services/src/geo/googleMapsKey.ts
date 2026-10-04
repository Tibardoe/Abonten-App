import { logger } from "@abonten/core/logger";

let warnedFallback = false;

/**
 * The key for Google calls the server makes (geocoding, Places).
 *
 * GOOGLE_MAPS_API_KEY is a server-only key limited to the Geocoding API and
 * Places API (New): it is never sent to a browser or built into the app.
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is the website's browser key; once it is
 * limited to Abonten's websites Google refuses it for server calls, so it
 * stands in only on a deployment that has no server key yet.
 */
export function googleMapsServerKey(): string | null {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) return key;
  const fallback = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (fallback && !warnedFallback) {
    warnedFallback = true;
    logger.warn(
      "GOOGLE_MAPS_API_KEY is not set: server Google calls fall back to the browser key.",
    );
  }
  return fallback || null;
}
