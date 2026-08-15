"use client";

import { usePlacesAutocomplete } from "@/hooks/usePlacesAutocomplete";
import type { AutoCompleteAddressType } from "@/types/autoCompleteAddressType";
import type { AutoCompletePlaceholderType } from "@/types/autoCompletePlaceholderType";
import { IoLocationOutline } from "react-icons/io5";

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
  value,
  onSelectCoordinates,
}: AddressProp) {
  const {
    googleMapsApiKey,
    isLoaded,
    inputValue,
    searchResults,
    containerRef,
    handleInputChange,
    handleSelectPrediction,
    handleSelectCurrentLocation,
  } = usePlacesAutocomplete({ address, value, onSelectCoordinates });

  if (!googleMapsApiKey) {
    return (
      <div className="text-destructive">
        Google Maps API key is missing. Please add it to your environment
        variables.
      </div>
    );
  }

  if (!isLoaded)
    return <div className="text-muted-foreground">Loading Google Maps...</div>;

  return (
    <div
      ref={containerRef}
      className="bg-muted rounded-lg flex justify-between items-center py-3 md:py-2 gap-2 relative w-full"
    >
      <input
        type="text"
        onChange={handleInputChange}
        value={inputValue}
        placeholder={placeholderText.text}
        className="text-foreground outline-none w-full bg-transparent"
      />

      <IoLocationOutline className="text-2xl" />

      {searchResults.length > 0 && (
        <ul className="absolute top-full left-0 w-full max-h-60 bg-popover text-popover-foreground text-lg border border-border rounded shadow-md mt-1 z-10 overflow-y-auto">
          <button
            type="button"
            onClick={handleSelectCurrentLocation}
            className="p-2 w-full text-start font-semibold hover:bg-accent border-b border-border"
          >
            📍 Use my current location
          </button>

          {searchResults.map((result) => (
            <button
              type="button"
              key={result.place_id}
              onClick={() =>
                handleSelectPrediction(
                  result.description,
                  result.structured_formatting.main_text,
                  result.place_id,
                )
              }
              className="p-2 w-full text-start hover:bg-accent cursor-pointer border-b border-border"
            >
              <div className="font-semibold text-sm text-popover-foreground">
                {result.structured_formatting.main_text}
              </div>
              <div className="text-xs text-muted-foreground">
                {result.structured_formatting.secondary_text}
              </div>
            </button>
          ))}
        </ul>
      )}
    </div>
  );
}
