"use client";

import { eventCategoriesAndTypes } from "@/data/eventCategoriesAndTypes";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  MIN_SUGGESTION_QUERY_LENGTH,
  useSearchSuggestions,
} from "@/hooks/useSearchSuggestions";
import { isExploreTab } from "@/places/exploreTab";
import type {
  SuggestionItem,
  SuggestionSection,
} from "@/types/searchSuggestionType";
import { generateSlug } from "@/utils/geerateSlug";
import {
  addRecentSearch,
  clearRecentSearches,
  getRecentSearches,
  removeRecentSearch,
} from "@/utils/recentSearches";
// import Image from "next/image";
import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { IoSearch } from "react-icons/io5";
import { VscSettings } from "react-icons/vsc";
import { searchFieldInputClassName } from "../lib/searchFieldStyles";
import FilterModalPopup from "../organisms/FilterModalPopup";
import SearchSuggestionsDropdown from "../organisms/SearchSuggestionsDropdown";

const EVENT_CATEGORY_SUGGESTION_LIMIT = 4;
const PLACE_CATEGORY_SUGGESTION_LIMIT = 3;
const RECENT_SUGGESTION_LIMIT = 5;
const BROWSE_SHORTCUT_LIMIT = 6;

const EVENT_CATEGORY_NAMES = eventCategoriesAndTypes.map((c) => c.category);

function matchCategoryNames(
  query: string,
  names: string[],
  limit: number,
): string[] {
  const lower = query.toLowerCase();
  return names
    .filter((name) => name.toLowerCase().includes(lower))
    .slice(0, limit);
}

// useSearchParams() (needed to know which Explore tab is active, see below)
// opts a component out of static rendering unless wrapped in Suspense --
// /events statically prerenders this component's parent
// (LocationAndFilterSection), so the actual logic lives in
// FilterSearchBarContent and this default export just supplies the
// boundary. The fallback matches the settled layout closely enough that
// there's no visible jump on the static pages that render it.
export default function FilterSearchBar() {
  return (
    <Suspense fallback={<FilterSearchBarFallback />}>
      <FilterSearchBarContent />
    </Suspense>
  );
}

function FilterSearchBarFallback() {
  return (
    <div className="w-full md:w-fit bg-muted rounded-lg flex justify-between p-3">
      <div className="flex items-center gap-2">
        <IoSearch className="text-2xl text-muted-foreground" />
        <span className="text-lg text-muted-foreground mr-5">
          Search events, places, restaurants, activities...
        </span>
      </div>
      <VscSettings className="text-3xl md:text-4xl text-muted-foreground" />
    </div>
  );
}

function FilterSearchBarContent() {
  const [showPopup, setShowPopup] = useState(false);

  const [searchText, setSearchText] = useState("");

  // Only meaningful on /explore/[location], which is the one route with
  // Events/Places tabs -- everywhere else this stays "events" (unchanged
  // behavior). See the Places spec: search/filter should adapt to whichever
  // tab is selected.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const tabParam = searchParams.get("tab") ?? undefined;
  const activeTab: "events" | "places" = isExploreTab(tabParam)
    ? tabParam
    : "events";

  const params = useParams();
  const locationSlug =
    typeof params?.location === "string" ? params.location : "";

  // Only true on /explore/[location] -- /events and
  // /events/location/[location] also render this component but must keep
  // routing Events-filter submits to /search unchanged.
  const isExplorePage = pathname?.startsWith("/explore/") ?? false;
  const exploreEventsBasePath =
    isExplorePage && activeTab === "events"
      ? `/explore/${locationSlug}`
      : undefined;

  // /search is the default/legacy filter-modal branch's results page (see
  // FilterModalPopup's default branch) -- reopening the modal there, or
  // refreshing the page, must restore the filters already baked into the
  // URL just like Explore does, instead of showing an empty modal on top of
  // an already-filtered result set.
  const isLegacySearchPage = pathname === "/search";

  const numericParam = (key: string): number | undefined => {
    const raw = searchParams.get(key);
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  // "GHS 0 - GHS 250" -> [0, 250], matching the shape FilterModalPopup's
  // default branch writes into ?price=.
  const parseLegacyPriceRange = (
    raw: string | null,
  ): { min?: number; max?: number } => {
    if (!raw) return {};
    const match = raw.match(/(\d+(?:\.\d+)?)\s*-\s*GHS\s*(\d+(?:\.\d+)?)/i);
    if (!match) return {};
    return { min: Number(match[1]), max: Number(match[2]) };
  };

  const initialEventCategory =
    exploreEventsBasePath != null
      ? (searchParams.get("eventCategory") ?? "")
      : isLegacySearchPage
        ? (searchParams.get("category") ?? "")
        : "";

  const initialEventTypes = isLegacySearchPage
    ? (searchParams.get("types")?.split(",").filter(Boolean) ?? [])
    : [];

  const legacyPrice = isLegacySearchPage
    ? parseLegacyPriceRange(searchParams.get("price"))
    : {};

  const initialEventMinPrice =
    exploreEventsBasePath != null
      ? numericParam("eventMinPrice")
      : isLegacySearchPage
        ? legacyPrice.min
        : undefined;
  const initialEventMaxPrice =
    exploreEventsBasePath != null
      ? numericParam("eventMaxPrice")
      : isLegacySearchPage
        ? legacyPrice.max
        : undefined;
  const initialEventFromDate =
    exploreEventsBasePath != null
      ? (searchParams.get("eventFrom") ?? undefined)
      : isLegacySearchPage
        ? (searchParams.get("from") ?? undefined)
        : undefined;
  const initialEventToDate =
    exploreEventsBasePath != null
      ? (searchParams.get("eventTo") ?? undefined)
      : isLegacySearchPage
        ? (searchParams.get("to") ?? undefined)
        : undefined;
  const initialEventMinRating =
    exploreEventsBasePath != null
      ? numericParam("eventRating")
      : isLegacySearchPage
        ? numericParam("rating")
        : undefined;
  const initialEventMaxDistanceKm =
    exploreEventsBasePath != null
      ? numericParam("eventDistance")
      : isLegacySearchPage
        ? numericParam("distance")
        : undefined;

  // Small "filters are active" indicator on the Filters button -- the
  // standard discovery-app cue (Airbnb, Eventbrite) that something beyond
  // the default view is already applied, so a user reopening the modal (or
  // never opening it) still notices the current result set is filtered.
  const activeFilterKeys = isExplorePage
    ? activeTab === "events"
      ? [
          "eventCategory",
          "eventMinPrice",
          "eventMaxPrice",
          "eventFrom",
          "eventTo",
          "eventRating",
          "eventDistance",
        ]
      : ["category", "categoryId", "openNow", "rating", "distance"]
    : isLegacySearchPage
      ? ["category", "types", "from", "to", "rating", "distance", "price"]
      : [];
  const hasActiveFilters = activeFilterKeys.some((key) => {
    const value = searchParams.get(key);
    if (!value) return false;
    // /search always sets ?price=, even at the "Any" default -- only count
    // it once the range has actually been narrowed away from [0, 999].
    if (key === "price") {
      return value !== "GHS 0 - GHS 999";
    }
    return true;
  });

  const buildSearchHref = (text: string) =>
    activeTab === "places"
      ? `/explore/${locationSlug}?tab=places&q=${encodeURIComponent(text)}`
      : `/search/${generateSlug(text) ?? ""}`;

  const searchHref = buildSearchHref(searchText);

  // ---- Autocomplete/suggestions ----------------------------------------
  // Places (and place categories) only make sense where there's a location
  // context to browse them in -- today that's only /explore/[location] (the
  // one route with a Places tab at all), same gate `isExplorePage` already
  // uses above for filter-URL branching.
  const includePlaces = isExplorePage;

  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  useClickOutside([containerRef], () => setIsOpen(false));

  const handleShowPopup = (state: boolean) => {
    setIsOpen(false);
    setShowPopup(state);
  };

  const rawTrimmedQuery = searchText.trim();
  const isTyping = rawTrimmedQuery.length >= MIN_SUGGESTION_QUERY_LENGTH;

  const {
    events,
    places,
    placeCategories,
    isLoading: isLoadingSuggestions,
    query: debouncedQuery,
  } = useSearchSuggestions(searchText, includePlaces);

  const sections: SuggestionSection[] = [];
  let noMatches = false;

  if (!isTyping) {
    const recentItems: SuggestionItem[] = recentSearches
      .slice(0, RECENT_SUGGESTION_LIMIT)
      .map((text) => ({
        kind: "recent",
        key: `recent:${encodeURIComponent(text)}`,
        text,
      }));

    if (recentItems.length > 0) {
      sections.push({ label: "Recent", items: recentItems });
    } else {
      const shortcutItems: SuggestionItem[] = EVENT_CATEGORY_NAMES.slice(
        0,
        BROWSE_SHORTCUT_LIMIT,
      ).map((category) => ({
        kind: "eventCategory",
        key: `browse:${encodeURIComponent(category)}`,
        category,
      }));
      sections.push({ label: "Browse categories", items: shortcutItems });
    }
  } else {
    const eventItems: SuggestionItem[] = events.map((event) => ({
      kind: "event",
      key: `event:${event.id}`,
      event,
    }));
    const placeItems: SuggestionItem[] = places.map((place) => ({
      kind: "place",
      key: `place:${place.id}`,
      place,
    }));
    const matchedEventCategories = matchCategoryNames(
      rawTrimmedQuery,
      EVENT_CATEGORY_NAMES,
      EVENT_CATEGORY_SUGGESTION_LIMIT,
    );
    const matchedPlaceCategories = includePlaces
      ? placeCategories
          .filter((category) =>
            category.name.toLowerCase().includes(rawTrimmedQuery.toLowerCase()),
          )
          .slice(0, PLACE_CATEGORY_SUGGESTION_LIMIT)
      : [];
    const categoryItems: SuggestionItem[] = [
      ...matchedEventCategories.map((category) => ({
        kind: "eventCategory" as const,
        key: `cat:event:${encodeURIComponent(category)}`,
        category,
      })),
      ...matchedPlaceCategories.map((category) => ({
        kind: "placeCategory" as const,
        key: `cat:place:${category.id}`,
        category: { id: category.id, name: category.name },
      })),
    ];

    if (eventItems.length > 0)
      sections.push({ label: "Events", items: eventItems });
    if (placeItems.length > 0)
      sections.push({ label: "Places", items: placeItems });
    if (categoryItems.length > 0)
      sections.push({ label: "Categories", items: categoryItems });

    // Still waiting for the debounce to catch up with what's actually in the
    // box -- hold off on "no matches" until the results we have actually
    // correspond to the current text, so a fast typist never sees a flash of
    // "no matches" for a query that hasn't been searched yet.
    const stillDebouncing = debouncedQuery !== rawTrimmedQuery;
    noMatches =
      !isLoadingSuggestions &&
      !stillDebouncing &&
      eventItems.length === 0 &&
      placeItems.length === 0 &&
      categoryItems.length === 0;

    sections.push({
      label: "",
      items: [{ kind: "literal", key: "literal", text: rawTrimmedQuery }],
    });
  }

  const flatItems = sections.flatMap((section) => section.items);

  const recordRecentSearch = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setRecentSearches(addRecentSearch(trimmed));
  };

  const handleLiteralSearch = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    recordRecentSearch(trimmed);
    setIsOpen(false);
    router.push(buildSearchHref(trimmed));
  };

  const handleSelectItem = (item: SuggestionItem) => {
    switch (item.kind) {
      case "event":
        recordRecentSearch(item.event.title);
        setIsOpen(false);
        router.push(`/events/${item.event.event_code.toLowerCase()}`);
        return;
      case "place":
        recordRecentSearch(item.place.name);
        setIsOpen(false);
        router.push(`/places/${item.place.slug}`);
        return;
      case "eventCategory":
        setSearchText(item.category);
        setIsOpen(false);
        router.push(`/search?category=${encodeURIComponent(item.category)}`);
        return;
      case "placeCategory":
        setSearchText(item.category.name);
        setIsOpen(false);
        router.push(
          `/explore/${locationSlug}?tab=places&categoryId=${item.category.id}`,
        );
        return;
      case "recent":
        setSearchText(item.text);
        handleLiteralSearch(item.text);
        return;
      case "literal":
        handleLiteralSearch(item.text);
        return;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (!isOpen) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        setIsOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (flatItems.length === 0) return;
      const currentIndex = flatItems.findIndex(
        (item) => item.key === highlightedKey,
      );
      const nextIndex =
        event.key === "ArrowDown"
          ? currentIndex < flatItems.length - 1
            ? currentIndex + 1
            : 0
          : currentIndex <= 0
            ? flatItems.length - 1
            : currentIndex - 1;
      setHighlightedKey(flatItems[nextIndex].key);
    } else if (event.key === "Enter") {
      const highlighted = flatItems.find((item) => item.key === highlightedKey);
      if (highlighted) {
        event.preventDefault();
        handleSelectItem(highlighted);
      } else if (rawTrimmedQuery) {
        event.preventDefault();
        handleLiteralSearch(rawTrimmedQuery);
      }
    }
  };

  const showDropdown =
    isOpen &&
    !showPopup &&
    (sections.length > 0 || isLoadingSuggestions || noMatches);

  return (
    <div
      ref={containerRef}
      className="relative w-full md:w-fit bg-muted rounded-lg flex justify-between p-3 ring-1 ring-transparent transition-shadow focus-within:ring-ring"
    >
      <div className="flex items-center gap-2 mr-5 flex-1 min-w-0">
        <Link
          href={searchHref}
          onClick={() => recordRecentSearch(searchText)}
          aria-label="Search"
        >
          <IoSearch className="text-2xl text-muted-foreground" />
        </Link>

        <input
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="search-suggestions-listbox"
          aria-activedescendant={highlightedKey ?? undefined}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Search events, places, restaurants, activities..."
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setIsOpen(true);
            setHighlightedKey(null);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className={`${searchFieldInputClassName} min-w-0`}
        />
      </div>

      <button
        type="button"
        onClick={() => handleShowPopup(true)}
        className="relative"
        aria-label={hasActiveFilters ? "Filters (active)" : "Filters"}
      >
        <VscSettings className="text-3xl md:text-4xl text-muted-foreground" />
        {hasActiveFilters && (
          <span
            aria-hidden
            className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full bg-primary border-2 border-muted"
          />
        )}
      </button>

      {showDropdown && (
        <div id="search-suggestions-listbox">
          <SearchSuggestionsDropdown
            sections={sections}
            highlightedKey={highlightedKey}
            onHighlight={setHighlightedKey}
            onSelect={handleSelectItem}
            onRemoveRecent={(text) =>
              setRecentSearches(removeRecentSearch(text))
            }
            onClearRecent={() => {
              clearRecentSearches();
              setRecentSearches([]);
            }}
            isLoading={isLoadingSuggestions}
            noMatches={noMatches}
          />
        </div>
      )}

      {showPopup && (
        <FilterModalPopup
          handlePopup={handleShowPopup}
          contentType={activeTab}
          exploreEventsBasePath={exploreEventsBasePath}
          initialCategory={initialEventCategory}
          initialTypes={initialEventTypes}
          initialMinPrice={initialEventMinPrice}
          initialMaxPrice={initialEventMaxPrice}
          initialFromDate={initialEventFromDate}
          initialToDate={initialEventToDate}
          initialMinRating={initialEventMinRating}
          initialMaxDistanceKm={initialEventMaxDistanceKm}
        />
      )}
    </div>
  );
}
