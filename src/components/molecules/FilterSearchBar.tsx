"use client";

import { isExploreTab } from "@/places/exploreTab";
import { generateSlug } from "@/utils/geerateSlug";
// import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { IoSearch } from "react-icons/io5";
import { VscSettings } from "react-icons/vsc";
import { searchFieldInputClassName } from "../lib/searchFieldStyles";
import FilterModalPopup from "../organisms/FilterModalPopup";

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
  const initialEventCategory =
    exploreEventsBasePath != null
      ? (searchParams.get("eventCategory") ?? "")
      : "";

  const numericParam = (key: string): number | undefined => {
    const raw = searchParams.get(key);
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const initialEventMinPrice =
    exploreEventsBasePath != null ? numericParam("eventMinPrice") : undefined;
  const initialEventMaxPrice =
    exploreEventsBasePath != null ? numericParam("eventMaxPrice") : undefined;
  const initialEventFromDate =
    exploreEventsBasePath != null
      ? (searchParams.get("eventFrom") ?? undefined)
      : undefined;
  const initialEventToDate =
    exploreEventsBasePath != null
      ? (searchParams.get("eventTo") ?? undefined)
      : undefined;
  const initialEventMinRating =
    exploreEventsBasePath != null ? numericParam("eventRating") : undefined;
  const initialEventMaxDistanceKm =
    exploreEventsBasePath != null ? numericParam("eventDistance") : undefined;

  // Small "filters are active" indicator on the Filters button -- the
  // standard discovery-app cue (Airbnb, Eventbrite) that something beyond
  // the default view is already applied, so a user reopening the modal (or
  // never opening it) still notices the current result set is filtered.
  const activeFilterKeys = !isExplorePage
    ? []
    : activeTab === "events"
      ? [
          "eventCategory",
          "eventMinPrice",
          "eventMaxPrice",
          "eventFrom",
          "eventTo",
          "eventRating",
          "eventDistance",
        ]
      : ["category", "categoryId", "openNow", "rating", "distance"];
  const hasActiveFilters = activeFilterKeys.some((key) =>
    searchParams.get(key),
  );

  const handleShowPopup = (state: boolean) => {
    setShowPopup(state);
  };

  const searchHref =
    activeTab === "places"
      ? `/explore/${locationSlug}?tab=places&q=${encodeURIComponent(searchText)}`
      : `/search/${generateSlug(searchText) ?? ""}`;

  return (
    <div className="w-full md:w-fit bg-muted rounded-lg flex justify-between p-3 ring-1 ring-transparent transition-shadow focus-within:ring-ring">
      <div className="flex items-center gap-2 mr-5">
        <Link href={searchHref}>
          <IoSearch className="text-2xl text-muted-foreground" />
        </Link>

        <input
          type="text"
          placeholder="Search events, places, restaurants, activities..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className={searchFieldInputClassName}
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

      {showPopup && (
        <FilterModalPopup
          handlePopup={handleShowPopup}
          contentType={activeTab}
          exploreEventsBasePath={exploreEventsBasePath}
          initialCategory={initialEventCategory}
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
