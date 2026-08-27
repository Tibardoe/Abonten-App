"use client";

import { usePlacesAutocomplete } from "@/hooks/usePlacesAutocomplete";
import type { AutoCompleteAddressType } from "@/types/autoCompleteAddressType";
import type { AutoCompletePlaceholderType } from "@/types/autoCompletePlaceholderType";
import type { ResolvedLocation } from "@/types/resolvedLocation";
import { generateSlug } from "@/utils/geerateSlug";
import { logger } from "@/utils/logger";
import { parseRawCoordinates } from "@/utils/parseRawCoordinates";
import { useRouter } from "next/navigation";
import { forwardRef, useCallback, useImperativeHandle } from "react";
import { IoLocationOutline } from "react-icons/io5";
import {
  searchFieldInputClassName,
  searchFieldWrapperClassName,
} from "../lib/searchFieldStyles";
import { cn } from "../lib/utils";

type AddressProp = {
  placeholderText: AutoCompletePlaceholderType;
  address: AutoCompleteAddressType;
  classname?: string;
  value?: string;
  onSelectCoordinates?: (location: ResolvedLocation) => void;
};

// Result of resolving whatever text is currently typed into the input,
// used by callers (e.g. the landing page "Go" button) that need to act on
// typed-but-not-yet-selected text the same way a clicked suggestion would.
export type ResolveTypedInputResult =
  | { status: "empty" }
  | { status: "resolved" }
  | { status: "unresolved"; rawText: string }
  // A genuine service/API failure rather than "no place matched".
  | { status: "error" };

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
      resolveCoordinates,
      geocodeAddressText,
    } = usePlacesAutocomplete({ address, value, onSelectCoordinates });

    // Layers this component's navigation behavior on top of the shared
    // resolve-and-update-input logic from the hook.
    const handleSelectPrediction = useCallback(
      async (description: string, mainText: string, placeId: string) => {
        const success = await resolvePrediction(description, mainText, placeId);

        if (success) {
          const pathSegment = mainText.trim().replace(/\s+/g, "-");
          router.push(
            `/explore/${generateSlug(encodeURIComponent(pathSegment))}`,
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

          // Raw "lat,lng" coordinates aren't something the Autocomplete
          // predictions API is built to handle -- resolve them directly via
          // reverse geocoding, then navigate the same way a resolved
          // prediction would.
          const coords = parseRawCoordinates(text);
          if (coords) {
            try {
              const resolvedAddress = await resolveCoordinates(coords);
              if (!resolvedAddress) {
                return { status: "unresolved", rawText: text };
              }
              const pathSegment = resolvedAddress.trim().replace(/\s+/g, "-");
              router.push(
                `/explore/${generateSlug(encodeURIComponent(pathSegment))}`,
              );
              return { status: "resolved" };
            } catch (error) {
              logger.error("Failed to reverse-geocode coordinates:", error);
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
            logger.error("Places predictions request failed:", error);
            return { status: "error" };
          }

          const topPrediction = predictions[0];
          if (!topPrediction) {
            // Places Autocomplete has no suggestion for this text (e.g.
            // compact digital address codes it doesn't index) -- fall back
            // to the Geocoding API directly, then navigate the same way a
            // resolved prediction would.
            try {
              const resolvedAddress = await geocodeAddressText(text);
              if (!resolvedAddress) {
                return { status: "unresolved", rawText: text };
              }
              const pathSegment = resolvedAddress.trim().replace(/\s+/g, "-");
              router.push(
                `/explore/${generateSlug(encodeURIComponent(pathSegment))}`,
              );
              return { status: "resolved" };
            } catch (error) {
              logger.error("Fallback geocoding failed:", error);
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
        router,
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
        className={cn(searchFieldWrapperClassName, "relative", classname)}
      >
        <IoLocationOutline className="text-3xl text-foreground shrink-0" />

        <input
          type="text"
          onChange={handleInputChange}
          value={inputValue}
          placeholder={placeholderText.text}
          className={searchFieldInputClassName}
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
