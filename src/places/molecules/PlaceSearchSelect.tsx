"use client";

import { getQueriedPlaces } from "@/actions/getQueriedPlaces";
import { useClickOutside } from "@/hooks/useClickOutside";
import type { PlaceType } from "@/types/placeType";
import debounce from "lodash.debounce";
import { useCallback, useMemo, useRef, useState } from "react";
import { IoStorefrontOutline } from "react-icons/io5";

type PlaceSearchSelectProps = {
  selectedPlaceId: string | null;
  selectedPlaceName: string | null;
  onSelect: (place: { id: string; name: string; address: string }) => void;
  onClear: () => void;
};

type AddressLike = { full_address?: string };

// Additive "pick an existing Abonten Place as this event's venue" search box
// -- sits alongside the free-text PostAutoComplete address field in
// EventUploadFormFields.tsx, not in place of it (per the Places spec: an
// event with no associated Place still just uses the manual address flow
// unchanged). Debounce idiom (lodash.debounce) matches
// usePlacesAutocomplete.ts's own use of the same library, rather than
// introducing a different debounce approach for this one component.
export default function PlaceSearchSelect({
  selectedPlaceId,
  selectedPlaceName,
  onSelect,
  onClear,
}: PlaceSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside([containerRef], () => setResults([]));

  const runSearch = useCallback(async (text: string) => {
    if (!text.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await getQueriedPlaces({
        searchText: text,
        pageSize: 6,
      });
      setResults(response.status === 200 ? response.data : []);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const debouncedSearch = useMemo(() => debounce(runSearch, 300), [runSearch]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  const handleSelect = (place: PlaceType) => {
    const address = (place.address as AddressLike).full_address ?? "";
    onSelect({ id: place.id, name: place.name, address });
    setQuery("");
    setResults([]);
  };

  if (selectedPlaceId && selectedPlaceName) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
        <span className="flex items-center gap-2 text-foreground truncate">
          <IoStorefrontOutline className="shrink-0 text-lg" />
          At <span className="font-medium">{selectedPlaceName}</span>
        </span>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-primary hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="bg-muted rounded-lg flex items-center gap-2 py-3 md:py-2 px-3">
        <IoStorefrontOutline className="text-lg text-muted-foreground shrink-0" />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          placeholder="Search an existing Abonten Place (optional)"
          className="text-foreground outline-none w-full bg-transparent text-sm"
        />
      </div>

      {(results.length > 0 || isSearching) && (
        <ul className="absolute top-full left-0 w-full max-h-60 bg-popover text-popover-foreground border border-border rounded shadow-md mt-1 z-10 overflow-y-auto">
          {isSearching && (
            <li className="p-2 text-sm text-muted-foreground">Searching...</li>
          )}
          {results.map((place) => (
            <button
              type="button"
              key={place.id}
              onClick={() => handleSelect(place)}
              className="p-2 w-full text-start hover:bg-accent cursor-pointer border-b border-border last:border-0"
            >
              <div className="font-medium text-sm">{place.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {(place.address as AddressLike).full_address ?? ""}
              </div>
            </button>
          ))}
        </ul>
      )}
    </div>
  );
}
