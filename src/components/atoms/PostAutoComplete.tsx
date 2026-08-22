"use client";

import { usePlacesAutocomplete } from "@/hooks/usePlacesAutocomplete";
import type { AutoCompleteAddressType } from "@/types/autoCompleteAddressType";
import type { AutoCompletePlaceholderType } from "@/types/autoCompletePlaceholderType";
import type { ResolvedLocation } from "@/types/resolvedLocation";
import { parseRawCoordinates } from "@/utils/parseRawCoordinates";
import { forwardRef, useImperativeHandle } from "react";
import { IoLocationOutline } from "react-icons/io5";

type AddressProp = {
  placeholderText: AutoCompletePlaceholderType;
  address: AutoCompleteAddressType;
  classname?: string;
  value?: string;
  onSelectCoordinates?: (location: ResolvedLocation) => void;
};

// Result of resolving whatever text is currently typed into the input, even
// if the user never clicked a suggestion -- mirrors AutoComplete.tsx's
// ResolveTypedInputResult/resolveTypedInput exactly, minus the navigation
// side effect (callers here are multi-step create/edit forms that must stay
// on the current step, not the landing page's "Go" button).
export type PostAutoCompleteResolveResult =
  | { status: "empty" }
  | { status: "resolved" }
  | { status: "unresolved"; rawText: string }
  // A genuine service/API failure (script not loaded, network error,
  // Google returned an error status) rather than "no place matched" --
  // callers should show a service-outage message, not "location unknown".
  | { status: "error" };

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
      resolveCoordinates,
      geocodeAddressText,
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

          // Raw "lat,lng" coordinates aren't something the Autocomplete
          // predictions API is built to handle -- resolve them directly via
          // reverse geocoding instead (same path "use my current location"
          // uses).
          const coords = parseRawCoordinates(text);
          if (coords) {
            try {
              const resolvedAddress = await resolveCoordinates(coords);
              return resolvedAddress
                ? { status: "resolved" }
                : { status: "unresolved", rawText: text };
            } catch (error) {
              console.error("Failed to reverse-geocode coordinates:", error);
              return { status: "error" };
            }
          }

          if (!autocompleteServiceRef.current || !sessionTokenRef.current) {
            return { status: "error" };
          }

          const request: google.maps.places.AutocompleteRequest = {
            input: text,
            sessionToken: sessionTokenRef.current,
            ...(countryCode && {
              componentRestrictions: { country: countryCode },
            }),
          };

          let predictions: google.maps.places.AutocompletePrediction[];
          try {
            predictions = await new Promise<
              google.maps.places.AutocompletePrediction[]
            >((resolve, reject) => {
              autocompleteServiceRef.current?.getPlacePredictions(
                request,
                (results, status) => {
                  const { PlacesServiceStatus } = google.maps.places;
                  if (status === PlacesServiceStatus.OK && results) {
                    resolve(results);
                  } else if (status === PlacesServiceStatus.ZERO_RESULTS) {
                    resolve([]);
                  } else {
                    reject(new Error(status));
                  }
                },
              );
            });
          } catch (error) {
            console.error("Places predictions request failed:", error);
            return { status: "error" };
          }

          const topPrediction = predictions[0];
          if (!topPrediction) {
            // Places Autocomplete has no suggestion for this text -- it's
            // indexed for place names/addresses-as-you-type, and doesn't
            // recognize every valid address format (e.g. compact digital
            // address codes). Fall back to the Geocoding API directly
            // before giving up.
            try {
              const resolvedAddress = await geocodeAddressText(text);
              return resolvedAddress
                ? { status: "resolved" }
                : { status: "unresolved", rawText: text };
            } catch (error) {
              console.error("Fallback geocoding failed:", error);
              return { status: "error" };
            }
          }

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
        resolveCoordinates,
        geocodeAddressText,
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
          className="text-foreground outline-none w-full bg-transparent text-base md:text-sm"
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
