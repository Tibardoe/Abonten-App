"use client";

import { googleMapsLanguage } from "@abonten/core/geo/googleLanguage";
import { logger } from "@abonten/core/logger";
import { useJsApiLoader } from "@react-google-maps/api";
import { useLocale } from "next-intl";
import { useTheme } from "next-themes";

const LIBRARIES: ("places" | "marker")[] = ["places", "marker"];

// Pins are advanced markers, which need a Map ID: the map's settings kept
// in Google Cloud (project abonten-452216, Map management, "Abonten web",
// JavaScript, raster). A Map ID is not a secret; Google expects it in page
// code. NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID overrides it for a test map.
const MAP_ID =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "7ca0d719568c4064a177c611";

// The script can be loaded once per page load, with one set of options: a
// second load with another language is refused by Google's loader. So the
// language is fixed by the first map of the page load; after a language
// switch in Settings the maps follow on the next full load.
let loadedLanguage: string | null = null;
let warnedNoKey = false;

/**
 * Loads Google Maps once for every map, picker and address field on the
 * page, in the app's language. `isLoaded` stays false without an API key:
 * the caller shows its fallback (an address, a plain text field) instead
 * of a page-wide error.
 *
 * `mapId` and `colorScheme` go into every map's options. A map takes its
 * colour scheme only when it is created, so a map keys itself on
 * `colorScheme` to follow a switch between light and dark.
 */
export function useGoogleMaps(): {
  isLoaded: boolean;
  loadError?: Error;
  language: string;
  mapId: string;
  colorScheme: "DARK" | "LIGHT";
} {
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  // Google's own words on a map ("Zoom in", place names, address
  // suggestions) come in the language the script is loaded with.
  loadedLanguage ??= googleMapsLanguage(locale);
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey,
    libraries: LIBRARIES,
    language: loadedLanguage,
  });
  const appearance = {
    language: loadedLanguage,
    mapId: MAP_ID,
    colorScheme:
      resolvedTheme === "dark" ? ("DARK" as const) : ("LIGHT" as const),
  };
  if (!googleMapsApiKey) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      logger.error(
        "[useGoogleMaps] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set: maps and address suggestions are off.",
      );
    }
    return { isLoaded: false, ...appearance };
  }
  return { isLoaded, loadError, ...appearance };
}
