"use client";

import { isExploreTab } from "@/places/exploreTab";
import { generateSlug } from "@/utils/geerateSlug";
// import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { IoSearch } from "react-icons/io5";
import { VscSettings } from "react-icons/vsc";
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
  const tabParam = searchParams.get("tab") ?? undefined;
  const activeTab: "events" | "places" = isExploreTab(tabParam)
    ? tabParam
    : "events";

  const params = useParams();
  const locationSlug =
    typeof params?.location === "string" ? params.location : "";

  const handleShowPopup = (state: boolean) => {
    setShowPopup(state);
  };

  const searchHref =
    activeTab === "places"
      ? `/explore/${locationSlug}?tab=places&q=${encodeURIComponent(searchText)}`
      : `/search/${generateSlug(searchText) ?? ""}`;

  return (
    <div className="w-full md:w-fit bg-muted rounded-lg flex justify-between p-3">
      <div className="flex items-center gap-2">
        <Link href={searchHref}>
          <IoSearch className="text-2xl text-muted-foreground" />
        </Link>

        <input
          type="text"
          placeholder="Search events, places, restaurants, activities..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="outline-none text-lg bg-transparent mr-5"
        />
      </div>

      <button type="button" onClick={() => handleShowPopup(true)}>
        <VscSettings className="text-3xl md:text-4xl text-muted-foreground" />
      </button>

      {showPopup && (
        <FilterModalPopup
          handlePopup={handleShowPopup}
          contentType={activeTab}
        />
      )}
    </div>
  );
}
