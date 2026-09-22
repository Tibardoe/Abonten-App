import { useCallback, useEffect, useRef, useState } from "react";

// Native echo of the web usePlacesAutocomplete hook. The web uses the
// Google Maps JS SDK's AutocompleteService; on native there's no DOM, so
// this hits the Places web service REST endpoints directly with
// EXPO_PUBLIC_GOOGLE_MAPS_API_KEY. If the key is missing or referrer-locked
// the requests fail quietly and the field degrades to plain manual entry
// (same behaviour the web hook documents).
//
// Predictions are biased (not restricted) toward `near` — the area being
// browsed — within BIAS_RADIUS_METRES, and Ghana is the request's region:
// "Osu" then resolves to Osu, Accra before any other Osu in the world, and
// a Ghanaian town name beats a same-named place elsewhere, while a far-off
// place typed in full is still found. The web hook restricts to the
// visitor's country instead (looked up by IP); the bias does the same job
// without a lookup and without locking a traveller out.

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const AUTOCOMPLETE_URL =
  "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";
const BIAS_RADIUS_METRES = 200_000;
const REGION = "gh";

export type PlacePrediction = {
  placeId: string;
  primary: string;
  secondary: string;
};

export type ResolvedPlace = { lat: number; lng: number; address: string };

function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function usePlacesAutocomplete(
  near: { lat: number; lng: number } | null = null,
) {
  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const nearLat = near?.lat;
  const nearLng = near?.lng;
  const sessionRef = useRef(newSessionToken());
  const reqIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!KEY || query.trim().length < 3) {
      setPredictions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const id = ++reqIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const bias =
          nearLat != null && nearLng != null
            ? `&location=${nearLat},${nearLng}&radius=${BIAS_RADIUS_METRES}`
            : "";
        const url = `${AUTOCOMPLETE_URL}?input=${encodeURIComponent(
          query.trim(),
        )}&region=${REGION}${bias}&sessiontoken=${sessionRef.current}&key=${KEY}`;
        const res = await fetch(url);
        const json = (await res.json()) as {
          status: string;
          predictions?: {
            place_id: string;
            structured_formatting?: {
              main_text?: string;
              secondary_text?: string;
            };
            description?: string;
          }[];
        };
        if (id !== reqIdRef.current) return;
        if (json.status !== "OK" || !json.predictions) {
          setPredictions([]);
          return;
        }
        setPredictions(
          json.predictions.slice(0, 5).map((p) => ({
            placeId: p.place_id,
            primary: p.structured_formatting?.main_text ?? p.description ?? "",
            secondary: p.structured_formatting?.secondary_text ?? "",
          })),
        );
      } catch {
        if (id === reqIdRef.current) setPredictions([]);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, nearLat, nearLng]);

  const resolvePlace = useCallback(
    async (placeId: string): Promise<ResolvedPlace | null> => {
      if (!KEY) return null;
      try {
        const url = `${DETAILS_URL}?place_id=${placeId}&fields=geometry,name,formatted_address&sessiontoken=${sessionRef.current}&key=${KEY}`;
        const res = await fetch(url);
        const json = (await res.json()) as {
          status: string;
          result?: {
            formatted_address?: string;
            name?: string;
            geometry?: { location?: { lat: number; lng: number } };
          };
        };
        // Start a fresh session after a resolution (Google billing model).
        sessionRef.current = newSessionToken();
        const loc = json.result?.geometry?.location;
        if (json.status !== "OK" || !loc) return null;
        return {
          lat: loc.lat,
          lng: loc.lng,
          address:
            json.result?.formatted_address ?? json.result?.name ?? "Selected",
        };
      } catch {
        return null;
      }
    },
    [],
  );

  return {
    enabled: !!KEY,
    query,
    setQuery,
    predictions,
    clear: () => setPredictions([]),
    resolvePlace,
  };
}
