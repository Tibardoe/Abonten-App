"use client";

import { usePlacesAutocomplete } from "@/hooks/usePlacesAutocomplete";
import type { AutoCompleteAddressType } from "@/types/autoCompleteAddressType";
import type { AutoCompletePlaceholderType } from "@/types/autoCompletePlaceholderType";
import { generateSlug } from "@/utils/geerateSlug";
import { useRouter } from "next/navigation";
import { forwardRef, useCallback, useImperativeHandle } from "react";
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

// Result of resolving whatever text is currently typed into the input,
// used by callers (e.g. the landing page "Go" button) that need to act on
// typed-but-not-yet-selected text the same way a clicked suggestion would.
export type ResolveTypedInputResult =
  | { status: "empty" }
  | { status: "resolved" }
  | { status: "unresolved"; rawText: string };

export type AutoCompleteHandle = {
  resolveTypedInput: () => Promise<ResolveTypedInputResult>;
};

const AutoComplete = forwardRef<AutoCompleteHandle, AddressProp>(
  function AutoComplete(
    { placeholderText, address, classname, value, onSelectCoordinates },
    ref,
  ) {
    const router = useRouter();

    const {
      googleMapsApiKey,
      isLoaded,
      inputValue,
      searchResults,
      countryCode,
      containerRef,
      autocompleteServiceRef,
      sessionTokenRef,
      handleInputChange,
      handleSelectPrediction: resolvePrediction,
      handleSelectCurrentLocation,
    } = usePlacesAutocomplete({ address, value, onSelectCoordinates });

    // Layers this component's navigation behavior on top of the shared
    // resolve-and-update-input logic from the hook.
    const handleSelectPrediction = useCallback(
      async (description: string, mainText: string, placeId: string) => {
        const success = await resolvePrediction(description, mainText, placeId);

        if (success) {
          const pathSegment = mainText.trim().replace(/\s+/g, "-");
          router.push(
            `/events/location/${generateSlug(encodeURIComponent(pathSegment))}`,
          );
        }

        return success;
      },
      [resolvePrediction, router],
    );

    // Lets a parent (the landing page "Go" button) resolve whatever text is
    // currently typed — even if the user never clicked a suggestion — through
    // the exact same lookup + navigation path as clicking the top suggestion.
    useImperativeHandle(
      ref,
      () => ({
        resolveTypedInput: async (): Promise<ResolveTypedInputResult> => {
          const text = inputValue.trim();
          if (!text) return { status: "empty" };

          if (!autocompleteServiceRef.current || !sessionTokenRef.current) {
            return { status: "unresolved", rawText: text };
          }

          const request: google.maps.places.AutocompleteRequest = {
            input: text,
            sessionToken: sessionTokenRef.current,
            ...(countryCode && {
              componentRestrictions: { country: countryCode },
            }),
          };

          const predictions = await new Promise<
            google.maps.places.AutocompletePrediction[]
          >((resolve) => {
            autocompleteServiceRef.current?.getPlacePredictions(
              request,
              (results, status) => {
                if (
                  status === google.maps.places.PlacesServiceStatus.OK &&
                  results
                ) {
                  resolve(results);
                } else {
                  resolve([]);
                }
              },
            );
          });

          const topPrediction = predictions[0];
          if (!topPrediction) return { status: "unresolved", rawText: text };

          const resolved = await handleSelectPrediction(
            topPrediction.description,
            topPrediction.structured_formatting.main_text,
            topPrediction.place_id,
          );

          return resolved
            ? { status: "resolved" }
            : { status: "unresolved", rawText: text };
        },
      }),
      [
        inputValue,
        countryCode,
        autocompleteServiceRef,
        sessionTokenRef,
        handleSelectPrediction,
      ],
    );

    if (!googleMapsApiKey)
      return (
        <div className="text-destructive">Google Maps API key is missing.</div>
      );

    if (!isLoaded)
      return (
        <div className="text-muted-foreground">Loading Google Maps...</div>
      );

    return (
      <div
        ref={containerRef}
        className={`${
          classname ?? "bg-muted"
        } rounded-lg flex items-center py-3 px-2 gap-2 relative w-full`}
      >
        <IoLocationOutline className="text-3xl text-foreground" />

        <input
          type="text"
          onChange={handleInputChange}
          value={inputValue}
          placeholder={placeholderText.text}
          className="text-foreground outline-none w-full bg-transparent text-lg"
        />

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
                <div className="font-semibold text-popover-foreground">
                  {result.structured_formatting.main_text}
                </div>
                <div className="text-sm text-muted-foreground">
                  {result.structured_formatting.secondary_text}
                </div>
              </button>
            ))}
          </ul>
        )}
      </div>
    );
  },
);

AutoComplete.displayName = "AutoComplete";

export default AutoComplete;
