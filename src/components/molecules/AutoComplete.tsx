"use client";

import type { AutoCompleteAddressType } from "@/types/autoCompleteAddressType";
import type { AutoCompletePlaceholderType } from "@/types/autoCompletePlaceholderType";
import { getCoordinatesFromAddress } from "@/utils/getCoordinatesFromAddress";
import { type Libraries, useLoadScript } from "@react-google-maps/api";
import debounce from "lodash.debounce";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

const libraries: Libraries = ["places"];

type AddressProp = {
  placeholderText: AutoCompletePlaceholderType;
  address: AutoCompleteAddressType;
  classname?: string;
  value?: string;
  onSelectCoordinates?: (location: {
    lat: number;
    lng: number;
    address: string;
  }) => void;
};

export default function PostAutoComplete({
  placeholderText,
  address,
  classname,
  value,
  onSelectCoordinates,
}: AddressProp) {
  const [searchResults, setSearchResults] = useState<
    google.maps.places.PlacePrediction[]
  >([]);
  const [inputValue, setInputValue] = useState("");
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!googleMapsApiKey) {
    console.error(
      "Google Maps API key is missing. Check your .env.local file.",
    );
    return <div className="text-red-500">Google Maps API key is missing.</div>;
  }

  const { isLoaded } = useLoadScript({
    googleMapsApiKey,
    libraries,
  });

  useEffect(() => {
    if (isLoaded && window.google) {
      sessionTokenRef.current =
        new google.maps.places.AutocompleteSessionToken();
    }
  }, [isLoaded]);

  const fetchPlacePredictions = async (value: string) => {
    if (!value.trim() || !window.google || !sessionTokenRef.current) return;

    try {
      const { AutocompleteSuggestion } = (await google.maps.importLibrary(
        "places",
      )) as google.maps.PlacesLibrary;
      const request: google.maps.places.AutocompleteRequest = {
        input: value,
        sessionToken: sessionTokenRef.current,
      };

      const response =
        await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      const suggestions = response.suggestions || [];

      // Filter out any null predictions and map to PlacePrediction array.
      const predictions = suggestions
        .map((suggestion) => suggestion.placePrediction)
        .filter(
          (prediction): prediction is google.maps.places.PlacePrediction =>
            prediction !== null,
        );

      setSearchResults(predictions);
    } catch (error) {
      console.error("Error fetching autocomplete suggestions:", error);
    }
  };

  // Debounce the API call to avoid excessive calls while typing.
  const debouncedApiCall = useCallback(
    debounce(fetchPlacePredictions, 300),
    [],
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    debouncedApiCall(event.target.value);
  };

  const handleSelectPrediction = async (description: string) => {
    address?.address(description);
    setInputValue(description);
    localStorage.setItem("address", description);

    const coords = await getCoordinatesFromAddress(description);
    localStorage.setItem("coordinates", JSON.stringify(coords));

    setSearchResults([]);

    if (coords && onSelectCoordinates) {
      onSelectCoordinates({ ...coords, address: description });
    }
  };

  const handleSelectCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const geocoder = new google.maps.Geocoder();
        const latlng = { lat: latitude, lng: longitude };
        localStorage.setItem("coordinates", JSON.stringify(latlng));

        geocoder.geocode({ location: latlng }, (results, status) => {
          if (status === "OK" && results && results.length > 0) {
            const locationDescription = results[0].formatted_address;
            address?.address(locationDescription);
            setInputValue(locationDescription);
            localStorage.setItem("address", locationDescription);

            setSearchResults([]);
          } else {
            alert("No address found for your location.");
          }
        });
      },
      (error) => {
        console.error("Error getting current location:", error);
        alert("Unable to retrieve your location.");
      },
    );
  };

  useEffect(() => {
    if (value) setInputValue(value);
  }, [value]);

  if (!isLoaded)
    return (
      <div className="text-center text-gray-500">Loading Google Maps...</div>
    );

  return (
    <div
      className={`${
        classname ? classname : "bg-white"
      } rounded-lg flex items-center py-3 md:py-4 px-2 gap-2 relative w-full`}
    >
      <Image
        className="w-5 h-5 md:w-6 md:h-6 lg:h-8 lg:w-8"
        src={placeholderText.svgUrl}
        alt="Location image"
        width={30}
        height={30}
      />
      <input
        type="text"
        onChange={handleInputChange}
        value={inputValue}
        placeholder={placeholderText.text}
        className="text-black outline-none w-full bg-transparent"
      />

      {/* 🔥 Show suggestions below input */}
      {searchResults.length > 0 && (
        <ul className="absolute top-full left-0 w-full h-56 bg-white text-black text-lg border rounded shadow-md mt-1 z-10 overflow-y-scroll">
          <button
            type="button"
            onClick={handleSelectCurrentLocation}
            className="p-2 w-full font-semibold text-start hover:bg-gray-100 cursor-pointer border-b border-black border-opacity-30"
          >
            📍 Use my current location
          </button>

          {searchResults.map((result) => (
            <button
              type="button"
              key={result.placeId}
              onClick={() => handleSelectPrediction(result.text.toString())}
              aria-label={`Use location ${result.text}`}
              className="p-2 w-full text-start hover:bg-gray-100 cursor-pointer border-b border-black border-opacity-30"
            >
              {result.text.toString()}
            </button>
          ))}
        </ul>
      )}
    </div>
  );
}
