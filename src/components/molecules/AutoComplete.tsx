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
  address: AutoCompleteAddressType;
};

export default function AutoComplete({
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
    address.address(description);
    setInputValue(description);
    setSearchResults([]); // Clear dropdown
  };

  if (!isLoaded)
    return (
      <div className="text-center text-gray-500">Loading Google Maps...</div>
    );

  return (
    <div className="bg-white rounded-lg flex items-center py-4 px-2 gap-2 relative">
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
        className="text-black text-lg md:text-xl outline-none md:min-w-[400px]"
      />

      {/* 🔥 Show suggestions below input */}
      {searchResults.length > 0 && (
        <ul className="absolute top-full left-0 w-full h-56 bg-white text-black text-lg border rounded shadow-md mt-1 z-10 overflow-y-scroll">
          {searchResults.map((result) => (
            // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
            <li
              key={result.place_id}
              onClick={() => handleSelectPrediction(result.description)}
              className="p-2 hover:bg-gray-100 cursor-pointer border-b border-black border-opacity-30"
            >
              {result.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
