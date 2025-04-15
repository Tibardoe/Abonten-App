"use client";

import type { AutoCompleteAddressType } from "@/types/autoCompleteAddressType";
import type { AutoCompletePlaceholderType } from "@/types/autoCompletePlaceholderType";
import { type Libraries, useLoadScript } from "@react-google-maps/api";
import debounce from "lodash.debounce";
import Image from "next/image";
import { useCallback, useState } from "react";

const libraries: Libraries = ["places"];

type AddressProp = {
  placeholderText: AutoCompletePlaceholderType;
  address?: AutoCompleteAddressType;
};

export default function PostAutoComplete({
  placeholderText,
  address,
}: AddressProp) {
  const [searchResults, setSearchResults] = useState<
    google.maps.places.AutocompletePrediction[]
  >([]);
  const [inputValue, setInputValue] = useState("");

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

  // ✅ Calls Google Places API when user stops typing
  const fetchPlacePredictions = (value: string) => {
    if (!value.trim() || !window.google) return;

    const service = new google.maps.places.AutocompleteService();
    service.getPlacePredictions({ input: value }, (predictions) => {
      setSearchResults(predictions || []);
    });
  };

  const debouncedApiCall = useCallback(
    debounce(fetchPlacePredictions, 300),
    [],
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(event.target.value);
    debouncedApiCall(event.target.value);
  };

  const handleSelectPrediction = (description: string) => {
    address?.address(description);
    setInputValue(description);
    setSearchResults([]); // Clear dropdown
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

        geocoder.geocode({ location: latlng }, (results, status) => {
          if (status === "OK" && results && results.length > 0) {
            const locationDescription = results[0].formatted_address;
            address?.address(locationDescription); // update parent
            setInputValue(locationDescription); // fill input
            setSearchResults([]); // close dropdown
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

  if (!isLoaded)
    return (
      <div className="text-center text-gray-500">Loading Google Maps...</div>
    );

  return (
    <div className="bg-white rounded-lg flex justify-between items-center py-3 md:py-2 gap-2 relative w-full">
      <input
        type="text"
        onChange={handleInputChange}
        value={inputValue}
        placeholder={placeholderText.text}
        className="text-black outline-none w-full"
      />

      <Image
        className="w-6 h-6"
        src={placeholderText.svgUrl}
        alt="Location image"
        width={30}
        height={30}
      />

      {/* 🔥 Show suggestions below input */}
      {searchResults.length > 0 && (
        <ul className="absolute top-full left-0 w-full h-56 bg-white text-black border rounded shadow-md mt-1 z-10 overflow-y-scroll">
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
              key={result.place_id}
              onClick={() => handleSelectPrediction(result.description)}
              className="p-2 w-full text-start hover:bg-gray-100 cursor-pointer border-b border-black border-opacity-30"
            >
              {result.description}
            </button>
          ))}
        </ul>
      )}
    </div>
  );
}
