"use client";

import { useClickOutside } from "@/hooks/useClickOutside";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { useMarketContext } from "@/hooks/useMarketContext";
import { useToast } from "@/hooks/useToast";
import { logger } from "@abonten/core/logger";
import type { AutoCompleteAddressType } from "@abonten/types/autoCompleteAddressType";
import type { ResolvedLocation } from "@abonten/types/resolvedLocation";
import debounce from "lodash.debounce";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** One address suggestion, as the fields show it and as Google resolves it. */
export type PlaceSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  prediction: google.maps.places.PlacePrediction;
};

type UsePlacesAutocompleteOptions = {
  address?: AutoCompleteAddressType;
  value?: string;
  onSelectCoordinates?: (location: ResolvedLocation) => void;
};

/**
 * Shared Google Places Autocomplete logic behind AutoComplete.tsx and
 * PostAutoComplete.tsx — script loading, which countries to suggest places
 * in, debounced suggestions, session token lifecycle, and
 * place/current-location resolution.
 *
 * Suggestions come from Places API (New) (AutocompleteSuggestion; the older
 * AutocompleteService is closed to new Google customers). One session token
 * covers the typing and the one place it ends on, and a fresh token starts
 * after each pick: Google bills a session as one lookup, and a token used
 * again is billed request by request. The chosen place is asked for its
 * location only, so the lookup is billed at the cheapest rate. Each component only differs in what
 * happens *after* a place is resolved (AutoComplete additionally navigates;
 * PostAutoComplete doesn't), so that part stays in the components
 * themselves rather than in this hook.
 */
export function usePlacesAutocomplete({
  address,
  value,
  onSelectCoordinates,
}: UsePlacesAutocompleteOptions = {}) {
  const t = useTranslations("common");
  const { error: showError } = useToast();

  const [inputValue, setInputValue] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  // Suggest places in the countries Abonten is open in, not in whichever
  // country the visitor's connection is in: someone in London planning a
  // night out in Accra must be able to find Accra. (This used to ask a
  // third-party IP lookup for the visitor's country on every page with an
  // address field.) Google takes at most fifteen countries; with more open
  // markets than that, the one being browsed.
  const { markets, context } = useMarketContext();
  const marketCountry = context?.marketCountry ?? null;
  const countries = useMemo(() => {
    const open = markets.map((m) => m.countryCode.toLowerCase());
    if (open.length > 0 && open.length <= 15) return open;
    return marketCountry ? [marketCountry.toLowerCase()] : [];
  }, [markets, marketCountry]);

  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Guards against an out-of-order debounced predictions response (e.g. a
  // slow "Accra" request resolving after a faster "Kumasi" one) clobbering
  // the results for whatever is actually typed now.
  const latestRequestIdRef = useRef(0);

  useClickOutside([containerRef], () => setSearchResults([]));

  // A missing key or a failed script load is an operational problem, not
  // something to surface to end users -- the location field degrades to
  // plain manual entry either way (useGoogleMaps logs a missing key once).
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded, loadError, language } = useGoogleMaps();

  useEffect(() => {
    if (loadError) {
      logger.error("Google Maps script failed to load:", loadError);
    }
  }, [loadError]);

  // Places is ready once the script has loaded; until then (or without a
  // key) the field is a plain text field.
  const placesReady =
    isLoaded && typeof window !== "undefined" && !!window.google;

  useEffect(() => {
    if (placesReady) {
      sessionTokenRef.current =
        new window.google.maps.places.AutocompleteSessionToken();
    }
  }, [placesReady]);

  // Suggestions for `input`, in the app's language, in the open markets.
  // Throws when Google could not answer (a quota, key or network problem);
  // an empty list means nothing matched.
  const fetchSuggestions = useCallback(
    async (input: string): Promise<PlaceSuggestion[]> => {
      if (!placesReady || !sessionTokenRef.current) {
        throw new Error("Places is not loaded");
      }
      const { suggestions } =
        await google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(
          {
            input,
            sessionToken: sessionTokenRef.current,
            language,
            ...(countries.length > 0 && { includedRegionCodes: countries }),
          },
        );
      return suggestions.flatMap(({ placePrediction: p }) =>
        p
          ? [
              {
                placeId: p.placeId,
                mainText: p.mainText?.text ?? p.text.text,
                secondaryText: p.secondaryText?.text ?? "",
                prediction: p,
              },
            ]
          : [],
      );
    },
    [placesReady, language, countries],
  );

  const fetchPlacePredictionsCallback = useCallback(
    async (input: string) => {
      if (!input.trim() || !placesReady) return;

      const requestId = ++latestRequestIdRef.current;
      let results: PlaceSuggestion[] = [];
      try {
        results = await fetchSuggestions(input);
      } catch (error) {
        logger.warn("Places suggestions request failed:", error);
      }
      // A newer request has since been fired -- this response is stale,
      // ignore it so it can't overwrite fresher results.
      if (requestId !== latestRequestIdRef.current) return;
      setSearchResults(results);
    },
    [placesReady, fetchSuggestions],
  );

  const debouncedApiCall = useMemo(
    () => debounce(fetchPlacePredictionsCallback, 300),
    [fetchPlacePredictionsCallback],
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setInputValue(nextValue);

    if (!nextValue.trim()) {
      // Clearing the field should clear any previously selected location,
      // not leave a stale selection lingering behind an empty input. An
      // answer still on its way for the old text is dropped as stale.
      latestRequestIdRef.current++;
      setSearchResults([]);
      address?.address("");
    }

    debouncedApiCall(nextValue);
  };

  // Resolves a chosen suggestion and updates local input/result state.
  // Returns whether it succeeded so callers can layer their own follow-up
  // behavior (e.g. AutoComplete navigating) on top. Asking the place for
  // its location ends the session; the next keystroke starts a new one.
  const handleSelectPrediction = useCallback(
    async ({ mainText, prediction }: PlaceSuggestion): Promise<boolean> => {
      try {
        const place = prediction.toPlace();
        await place.fetchFields({ fields: ["location"] });
        sessionTokenRef.current =
          new google.maps.places.AutocompleteSessionToken();
        if (!place.location) throw new Error("The place has no location");
        const coords = {
          lat: place.location.lat(),
          lng: place.location.lng(),
        };

        address?.address(mainText);
        setInputValue(mainText);
        setSearchResults([]);
        onSelectCoordinates?.({ ...coords, address: mainText });

        return true;
      } catch (error) {
        logger.error(error);
        showError(t("failedToFetchPlaceDetails"));
        return false;
      }
    },
    [address, onSelectCoordinates, t, showError],
  );

  // Reverse-geocodes a lat/lng pair into a formatted address and commits it
  // through the same state-update path a predictions-based resolution
  // uses. Shared by "use my current location" and by resolving raw
  // "lat,lng" text typed directly into the input (Google's Autocomplete
  // suggestions aren't built to handle bare coordinates).
  const resolveCoordinates = useCallback(
    (latlng: { lat: number; lng: number }): Promise<string | null> => {
      return new Promise((resolve) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: latlng }, (results, status) => {
          if (status === "OK" && results && results.length > 0) {
            const formattedAddress = results[0].formatted_address;
            address?.address(formattedAddress);
            setInputValue(formattedAddress);
            setSearchResults([]);
            onSelectCoordinates?.({ ...latlng, address: formattedAddress });
            resolve(formattedAddress);
          } else {
            resolve(null);
          }
        });
      });
    },
    [address, onSelectCoordinates],
  );

  // Forward-geocodes typed text directly via the Geocoding API, bypassing
  // the Autocomplete predictions index entirely. Used as a fallback when
  // Places Autocomplete returns zero predictions for text that can still
  // be a genuinely resolvable address -- e.g. compact digital-address
  // codes (like Ghana Post GPS's "AK-150-5882") that aren't indexed as
  // autocomplete-suggestable places but that the Geocoding API itself
  // does understand. Reuses the same Geocoder already used for reverse
  // geocoding rather than introducing a second geocoding system.
  const geocodeAddressText = useCallback(
    (text: string): Promise<string | null> => {
      return new Promise((resolve) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: text }, (results, status) => {
          const location = results?.[0]?.geometry?.location;
          if (status === "OK" && results && results.length > 0 && location) {
            const formattedAddress = results[0].formatted_address;
            const coords = { lat: location.lat(), lng: location.lng() };
            address?.address(formattedAddress);
            setInputValue(formattedAddress);
            setSearchResults([]);
            onSelectCoordinates?.({ ...coords, address: formattedAddress });
            resolve(formattedAddress);
          } else {
            resolve(null);
          }
        });
      });
    },
    [address, onSelectCoordinates],
  );

  const handleSelectCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      showError(t("geolocationIsNotSupported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const resolvedAddress = await resolveCoordinates({
          lat: latitude,
          lng: longitude,
        });
        if (!resolvedAddress) showError(t("noAddressFound"));
      },
      (error) => {
        logger.error("Error getting location:", error);
        showError(t("unableToRetrieveLocation"));
      },
    );
  }, [resolveCoordinates, t, showError]);

  useEffect(() => {
    if (value) setInputValue(value);
  }, [value]);

  return {
    googleMapsApiKey,
    isLoaded,
    loadError,
    inputValue,
    searchResults,
    containerRef,
    placesReady,
    fetchSuggestions,
    handleInputChange,
    handleSelectPrediction,
    handleSelectCurrentLocation,
    resolveCoordinates,
    geocodeAddressText,
  };
}
