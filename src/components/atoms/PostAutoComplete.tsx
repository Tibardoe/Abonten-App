"use client";

import { usePlacesAutocomplete } from "@/hooks/usePlacesAutocomplete";
import type { AutoCompleteAddressType } from "@/types/autoCompleteAddressType";
import type { AutoCompletePlaceholderType } from "@/types/autoCompletePlaceholderType";
import { forwardRef, useImperativeHandle } from "react";
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

// Result of resolving whatever text is currently typed into the input, even
// if the user never clicked a suggestion -- mirrors AutoComplete.tsx's
// ResolveTypedInputResult/resolveTypedInput exactly, minus the navigation
// side effect (callers here are multi-step create/edit forms that must stay
// on the current step, not the landing page's "Go" button).
export type PostAutoCompleteResolveResult =
  | { status: "empty" }
  | { status: "resolved" }
  | { status: "unresolved"; rawText: string };

export type PostAutoCompleteHandle = {
  resolveTypedInput: () => Promise<PostAutoCompleteResolveResult>;
};

const PostAutoComplete = forwardRef<PostAutoCompleteHandle, AddressProp>(
  function PostAutoComplete(
    { placeholderText, address, value, onSelectCoordinates },
    ref,
  ) {
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
      handleSelectPrediction,
      handleSelectCurrentLocation,
    } = usePlacesAutocomplete({ address, value, onSelectCoordinates });

    // Lets a submit handler resolve whatever text is currently typed --
    // even if the user never clicked a suggestion -- through the exact same
    // predictions-lookup-then-resolve-top-match path a dropdown click uses,
    // so free-typed addresses can still produce real coordinates via
    // onSelectCoordinates instead of forcing submission to block on a
    // dropdown pick.
    useImperativeHandle(
      ref,
      () => ({
        resolveTypedInput: async (): Promise<PostAutoCompleteResolveResult> => {
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

    if (!googleMapsApiKey) {
      return (
        <div className="text-destructive">
          Google Maps API key is missing. Please add it to your environment
          variables.
        </div>
      );
    }

    if (!isLoaded)
      return (
        <div className="text-muted-foreground">Loading Google Maps...</div>
      );

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
  },
);

PostAutoComplete.displayName = "PostAutoComplete";

export default PostAutoComplete;
