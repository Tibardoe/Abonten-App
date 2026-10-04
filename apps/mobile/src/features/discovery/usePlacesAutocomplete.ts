import { api } from "@/lib/api";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useCallback, useEffect, useRef, useState } from "react";

// Native echo of the web usePlacesAutocomplete hook. Suggestions come from
// the server (/api/mobile/addresses/*, Google Places API (New)): the app
// holds no paid Google key. The server limits suggestions to the countries
// Abonten is open in, as the website does, and biases them toward `near`
// (the area being browsed), so "Osu" is Osu, Accra first. If the server
// cannot answer, the field degrades to plain manual entry.

const MIN_QUERY_LENGTH = 3;
const MAX_SUGGESTIONS = 5;

export type PlacePrediction = {
  placeId: string;
  primary: string;
  secondary: string;
};

export type ResolvedPlace = { lat: number; lng: number; address: string };

// One token for the typing and the pick that ends it: Google bills that
// session as one lookup. URL-safe, at most 36 characters.
function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function usePlacesAutocomplete(
  near: { lat: number; lng: number } | null = null,
) {
  const t = useTranslations("discovery");

  const [query, setQuery] = useState("");
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  // A request for the current text is on its way (debounce included).
  const [loading, setLoading] = useState(false);
  const nearLat = near?.lat;
  const nearLng = near?.lng;
  const sessionRef = useRef(newSessionToken());
  const reqIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setPredictions([]);
      setLoading(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const id = ++reqIdRef.current;
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.addresses.suggest({
          q: query.trim(),
          session: sessionRef.current,
          lat: nearLat,
          lng: nearLng,
        });
        if (id !== reqIdRef.current) return;
        setLoading(false);
        setPredictions(
          res.status === 200 && res.data
            ? res.data.slice(0, MAX_SUGGESTIONS)
            : [],
        );
      } catch {
        if (id === reqIdRef.current) {
          setPredictions([]);
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, nearLat, nearLng]);

  const resolvePlace = useCallback(
    async (placeId: string): Promise<ResolvedPlace | null> => {
      try {
        const res = await api.addresses.resolve({
          placeId,
          session: sessionRef.current,
        });
        // Start a fresh session after a resolution (Google billing model).
        sessionRef.current = newSessionToken();
        if (res.status !== 200 || !res.data) return null;
        return {
          ...res.data,
          address: res.data.address || t("selected"),
        };
      } catch {
        return null;
      }
    },
    [t],
  );

  return {
    enabled: true,
    query,
    setQuery,
    predictions,
    loading,
    clear: () => setPredictions([]),
    resolvePlace,
  };
}
