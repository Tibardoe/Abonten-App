"use client";

import { useClickOutside } from "@/hooks/useClickOutside";
import type { AutoCompleteAddressType } from "@/types/autoCompleteAddressType";
import { useLoadScript } from "@react-google-maps/api";
import debounce from "lodash.debounce";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const libraries: "places"[] = ["places"];

type UsePlacesAutocompleteOptions = {
  address?: AutoCompleteAddressType;
  value?: string;
  onSelectCoordinates?: (location: {
    lat: number;
    lng: number;
    address: string;
  }) => void;
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

  useClickOutside([containerRef], () => setSearchResults([]));

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const { isLoaded } = useLoadScript({
    googleMapsApiKey,
    libraries,
  });

  useEffect(() => {
    const fetchUserCountry = async () => {
      try {
        const res = await fetch("https://ipapi.co/json/");
        const data = await res.json();
        setCountryCode(data.country_code);
      } catch (error) {
        console.error("Failed to fetch country code:", error);
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
        console.error(error);
        alert("Failed to fetch place details.");
        return false;
      }
    },
    [address, onSelectCoordinates, getFormattedPlaceDetails],
  );

  const handleSelectCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const geocoder = new google.maps.Geocoder();
        const latlng = { lat: latitude, lng: longitude };

        geocoder.geocode({ location: latlng }, (results, status) => {
          if (status === "OK" && results && results.length > 0) {
            const formattedAddress = results[0].formatted_address;
            address?.address(formattedAddress);
            setInputValue(formattedAddress);
            setSearchResults([]);
            onSelectCoordinates?.({ ...latlng, address: formattedAddress });
          } else {
            alert("No address found.");
          }
        });
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Unable to retrieve location.");
      },
    );
  }, [address, onSelectCoordinates]);

  useEffect(() => {
    if (value) setInputValue(value);
  }, [value]);

  return {
    googleMapsApiKey,
    isLoaded,
    inputValue,
    searchResults,
    countryCode,
    containerRef,
    autocompleteServiceRef,
    sessionTokenRef,
    handleInputChange,
    handleSelectPrediction,
    handleSelectCurrentLocation,
  };
}
