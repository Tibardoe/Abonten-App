"use client";

import { useClickOutside } from "@/hooks/useClickOutside";
import { logger } from "@abonten/core/logger";
import type { AutoCompleteAddressType } from "@abonten/types/autoCompleteAddressType";
import type { ResolvedLocation } from "@abonten/types/resolvedLocation";
import { useLoadScript } from "@react-google-maps/api";
import debounce from "lodash.debounce";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const libraries: "places"[] = ["places"];

type UsePlacesAutocompleteOptions = {
  address?: AutoCompleteAddressType;
  value?: string;
  onSelectCoordinates?: (location: ResolvedLocation) => void;
};

/**
 * Shared Google Places Autocomplete logic behind AutoComplete.tsx and
 * PostAutoComplete.tsx — script loading, country detection (for restricting
 * suggestions), debounced predictions, session token lifecycle, and
 * place/current-location resolution. Each component only differs in what
 * happens *after* a place is resolved (AutoComplete additionally navigates;
 * PostAutoComplete doesn't), so that part stays in the components
 * themselves rather than in this hook.
 */
export function usePlacesAutocomplete({
  address,
  value,
  onSelectCoordinates,
}: UsePlacesAutocompleteOptions = {}) {
  const [inputValue, setInputValue] = useState("");
  const [searchResults, setSearchResults] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [countryCode, setCountryCode] = useState<string | null>(null);

  const autocompleteServiceRef =
    useRef<google.maps.places.AutocompleteService | null>(null);
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Guards against an out-of-order debounced predictions response (e.g. a
  // slow "Accra" request resolving after a faster "Kumasi" one) clobbering
  // the results for whatever is actually typed now.
  const latestRequestIdRef = useRef(0);

  useClickOutside([containerRef], () => setSearchResults([]));

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey,
    libraries,
  });

  // A missing key or a failed script load is an operational problem, not
  // something to surface to end users -- the location field degrades to
  // plain manual entry either way. Log it once so it's visible in
  // monitoring instead of only as a broken-looking input.
  useEffect(() => {
    if (!googleMapsApiKey) {
      logger.error(
        "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set -- location autocomplete is disabled; manual entry only.",
      );
    }
  }, [googleMapsApiKey]);

  useEffect(() => {
    if (loadError) {
      logger.error("Google Maps script failed to load:", loadError);
    }
  }, [loadError]);

  useEffect(() => {
    const fetchUserCountry = async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        setCountryCode(data.country_code);
      } catch (error) {
        logger.error("Failed to fetch country code:", error);
      }
    };

    fetchUserCountry();
  }, []);

  useEffect(() => {
    if (isLoaded && window.google) {
      autocompleteServiceRef.current =
        new window.google.maps.places.AutocompleteService();
      sessionTokenRef.current =
        new window.google.maps.places.AutocompleteSessionToken();
    }
  }, [isLoaded]);

  const fetchPlacePredictionsCallback = useCallback(
    async (input: string) => {
      if (
        !input.trim() ||
        !autocompleteServiceRef.current ||
        !sessionTokenRef.current
      )
        return;

      const requestId = ++latestRequestIdRef.current;

      const request: google.maps.places.AutocompleteRequest = {
        input,
        sessionToken: sessionTokenRef.current,
        ...(countryCode && {
          componentRestrictions: { country: countryCode },
        }),
      };

      autocompleteServiceRef.current.getPlacePredictions(
        request,
        (predictions, status) => {
          // A newer request has since been fired -- this response is stale,
          // ignore it so it can't overwrite fresher results.
          if (requestId !== latestRequestIdRef.current) return;

          if (
            status === google.maps.places.PlacesServiceStatus.OK &&
            predictions
          ) {
            setSearchResults(predictions);
          } else {
            setSearchResults([]);
          }
        },
      );
    },
    [countryCode],
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
      // not leave a stale selection lingering behind an empty input.
      setSearchResults([]);
      address?.address("");
    }

    debouncedApiCall(nextValue);
  };

  const getFormattedPlaceDetails = useCallback(
    (placeId: string): Promise<google.maps.places.PlaceResult> => {
      return new Promise((resolve, reject) => {
        const service = new google.maps.places.PlacesService(
          document.createElement("div"),
        );
        service.getDetails({ placeId }, (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place) {
            resolve(place);
          } else {
            reject("Failed to get place details.");
          }
        });
      });
    },
    [],
  );

  // Resolves a chosen prediction and updates local input/result state.
  // Returns whether it succeeded so callers can layer their own follow-up
  // behavior (e.g. AutoComplete navigating) on top.
  const handleSelectPrediction = useCallback(
    async (
      _description: string,
      mainText: string,
      placeId: string,
    ): Promise<boolean> => {
      try {
        const place = await getFormattedPlaceDetails(placeId);
        const coords = {
          lat: place.geometry?.location?.lat() ?? 0,
          lng: place.geometry?.location?.lng() ?? 0,
        };

        address?.address(mainText);
        setInputValue(mainText);
        setSearchResults([]);
        onSelectCoordinates?.({ ...coords, address: mainText });

        return true;
      } catch (error) {
        logger.error(error);
        alert("Failed to fetch place details.");
        return false;
      }
    },
    [address, onSelectCoordinates, getFormattedPlaceDetails],
  );

  // Reverse-geocodes a lat/lng pair into a formatted address and commits it
  // through the same state-update path a predictions-based resolution
  // uses. Shared by "use my current location" and by resolving raw
  // "lat,lng" text typed directly into the input (Google's Autocomplete
  // predictions API isn't built to handle bare coordinates).
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
      alert("Geolocation is not supported.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const resolvedAddress = await resolveCoordinates({
          lat: latitude,
          lng: longitude,
        });
        if (!resolvedAddress) alert("No address found.");
      },
      (error) => {
        logger.error("Error getting location:", error);
        alert("Unable to retrieve location.");
      },
    );
  }, [resolveCoordinates]);

  useEffect(() => {
    if (value) setInputValue(value);
  }, [value]);

  return {
    googleMapsApiKey,
    isLoaded,
    loadError,
    inputValue,
    searchResults,
    countryCode,
    containerRef,
    autocompleteServiceRef,
    sessionTokenRef,
    handleInputChange,
    handleSelectPrediction,
    handleSelectCurrentLocation,
    resolveCoordinates,
    geocodeAddressText,
  };
}
