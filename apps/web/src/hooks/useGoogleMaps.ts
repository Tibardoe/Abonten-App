"use client";

import { logger } from "@abonten/core/logger";
import { useJsApiLoader } from "@react-google-maps/api";
import { useLocale } from "next-intl";

const LIBRARIES: "places"[] = ["places"];

// Google's own words on a map ("Zoom in", "Keyboard shortcuts", place
// names, address suggestions) come in the language the script is loaded
// with. Akan is not one of Google's languages; it reads English.
const MAP_LANGUAGE: Record<string, string> = {
  en: "en-GB",
  fr: "fr",
  es: "es",
  de: "de",
  pt: "pt-PT",
  ak: "en-GB",
};

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
 */
export function useGoogleMaps(): { isLoaded: boolean; loadError?: Error } {
  const locale = useLocale();
  loadedLanguage ??= MAP_LANGUAGE[locale] ?? "en-GB";
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey,
    libraries: LIBRARIES,
    language: loadedLanguage,
  });
  if (!googleMapsApiKey) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      logger.error(
        "[useGoogleMaps] NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set: maps and address suggestions are off.",
      );
    }
    return { isLoaded: false };
  }
  return { isLoaded, loadError };
}
