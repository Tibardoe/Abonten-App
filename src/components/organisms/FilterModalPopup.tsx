"use client";

// import { eventCategoriesAndTypes } from "@/data/eventCategoriesAndTypes";
import MaskIcon from "@/components/atoms/MaskIcon";
import React from "react";
import { useState } from "react";
import RangeSlider from "react-range-slider-input";
import "react-range-slider-input/dist/style.css";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
// import {
//   Popover,
//   PopoverContent,
//   PopoverTrigger,
// } from "@/components/ui/popover";
import { distances, rating } from "@/data/distanceAndRating";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import PlaceCategoryPicker from "@/places/molecules/PlaceCategoryPicker";
import { getCurrentPosition } from "@/utils/getCurrentPosition";
// Date moodules
// import { addDays, format } from "date-fns";
// import { CalendarIcon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import type { DateRange } from "react-day-picker";
import { cn } from "../lib/utils";
import CategoryFilter from "../molecules/CategoryFilter";
import TypeFilter from "../molecules/TypeFilter";

type FilterModalPopupProp = {
  handlePopup: (state: boolean) => void;
  className?: React.HTMLAttributes<HTMLDivElement>;
  // Which tab this filter applies to -- the Places spec explicitly requires
  // the filter modal to adapt to the selected tab (Category/Date/Price/
  // Distance for Events vs. Category/Distance/Open now/Rating for Places,
  // with irrelevant fields like Event date hidden on Places). Defaults to
  // "events" so every existing call site keeps its current behavior.
  contentType?: "events" | "places";
  // Set only when opened from the Explore page's Events tab (see
  // FilterSearchBar.tsx) -- when present, the Events branch in
  // handleFilter writes the category selection back to this Explore URL
  // (?tab=events&eventCategory=...) instead of routing to /search,
  // mirroring the Places branch's existing
  // /explore/[location]?tab=places&categoryId=... pattern. Every other
  // caller (e.g. /events, /events/location/[location]) leaves this unset
  // and keeps routing to /search unchanged.
  exploreEventsBasePath?: string;
  // Preselects every field from Explore's current ?eventCategory=/
  // eventMinPrice=/eventMaxPrice=/eventFrom=/eventTo=/eventRating=/
  // eventDistance= when opened from that context, so reopening the modal
  // never looks like it "forgot" an active filter -- the standard pattern
  // discovery apps (Airbnb, Eventbrite) use for a filter modal that shares
  // state with quick-filter chips. Unset ("" / undefined) everywhere else.
  initialCategory?: string;
  initialMinPrice?: number;
  initialMaxPrice?: number;
  initialFromDate?: string;
  initialToDate?: string;
  initialMinRating?: number;
  initialMaxDistanceKm?: number;
};

// Parses "Up to 5km" -> 5, "From 4.5" -> 4.5. Both arrays (src/data/
// distanceAndRating.ts) are shared between Events and Places filtering.
const parseLeadingNumber = (value: string): number | null => {
  const match = value.match(/[\d.]+/);
  return match ? Number(match[0]) : null;
};

export default function FilterModalPopup({
  handlePopup,
  className,
  contentType = "events",
  exploreEventsBasePath,
  initialCategory = "",
  initialMinPrice,
  initialMaxPrice,
  initialFromDate,
  initialToDate,
  initialMinRating,
  initialMaxDistanceKm,
}: FilterModalPopupProp) {
  useBodyScrollLock(true);

  const params = useParams();
  const locationSlug =
    typeof params?.location === "string" ? params.location : "";

  // No range picked by default (rather than silently defaulting to "today
  // only") -- an untouched date field must mean "no date filter", not an
  // invisible filter the user never chose.
  const [date, setDate] = React.useState<DateRange | undefined>(() =>
    initialFromDate || initialToDate
      ? {
          from: initialFromDate ? new Date(initialFromDate) : undefined,
          to: initialToDate ? new Date(initialToDate) : undefined,
        }
      : undefined,
  );

  // [0, 999] is "Any price" (999 already renders as "Any" below) -- the true
  // no-filter default, rather than an arbitrary 0-20 cap that would silently
  // exclude every event priced above GHS 20 until the user notices.
  const [minMax, setMinMax] = useState<[number, number]>([
    initialMinPrice ?? 0,
    initialMaxPrice ?? 999,
  ]);

  const [category, setCategory] = useState(initialCategory);

  const [types, setTypes] = useState<string[]>([]);

  const [ratingg, setRating] = useState(
    () => rating.find((r) => parseLeadingNumber(r) === initialMinRating) ?? "",
  );

  const [distance, setDistance] = useState(
    () =>
      distances.find((d) => parseLeadingNumber(d) === initialMaxDistanceKm) ??
      "",
  );

  // Places-only filter state -- kept separate from the Events fields above
  // (category/types) since place_category is a different lookup table and
  // Places has no "types" concept.
  const [placeCategoryId, setPlaceCategoryId] = useState<number | null>(null);

  const [openNowOnly, setOpenNowOnly] = useState(false);

  const router = useRouter();

  const handleFilter = async () => {
    if (contentType === "places") {
      const query = new URLSearchParams({ tab: "places" });
      if (placeCategoryId !== null) {
        query.set("categoryId", String(placeCategoryId));
      }
      if (openNowOnly) query.set("openNow", "true");
      const minRating = parseLeadingNumber(ratingg);
      if (minRating !== null) query.set("rating", String(minRating));
      const maxDistanceKm = parseLeadingNumber(distance);
      if (maxDistanceKm !== null) query.set("distance", String(maxDistanceKm));

      router.push(`/explore/${locationSlug}?${query.toString()}`);
      return;
    }

    if (contentType === "events" && exploreEventsBasePath) {
      // Every field the modal exposes round-trips through Explore's URL
      // alongside the category chip row, combining with AND semantics --
      // the same "quick chips + advanced filters modal share one filter
      // state" pattern used by discovery apps like Airbnb/Eventbrite,
      // rather than only syncing category and leaving price/date/rating/
      // distance modal-only.
      const query = new URLSearchParams({ tab: "events" });
      if (category) query.set("eventCategory", category);
      if (minMax[0] > 0) query.set("eventMinPrice", String(minMax[0]));
      if (minMax[1] < 999) query.set("eventMaxPrice", String(minMax[1]));
      if (date?.from) query.set("eventFrom", date.from.toISOString());
      if (date?.to) query.set("eventTo", date.to.toISOString());
      const minRating = parseLeadingNumber(ratingg);
      if (minRating !== null) query.set("eventRating", String(minRating));
      const maxDistanceKm = parseLeadingNumber(distance);
      if (maxDistanceKm !== null) {
        query.set("eventDistance", String(maxDistanceKm));
      }

      router.push(`${exploreEventsBasePath}?${query.toString()}`);
      return;
    }

    const coordinates = await getCurrentPosition();

    const query = new URLSearchParams({
      price: `GHS ${minMax[0]} - GHS ${minMax[1]}`,
      category,
      types: types.join(","),
      from: date?.from?.toISOString() || "",
      to: date?.to?.toISOString() || "",
      rating: ratingg,
      distance: distance,
      lat: coordinates.coords.latitude.toString(),
      lng: coordinates.coords.longitude.toString(),
    });

    router.push(`/search?${query.toString()}`);
  };

  const handleReset = () => {
    setDate(undefined);

    setMinMax([0, 999]);

    setCategory("");

    setTypes([]);

    setRating("");

    setDistance("");

    setPlaceCategoryId(null);

    setOpenNowOnly(false);
  };

  const handleCategory = (categoryName: string) => {
    setCategory(categoryName);
  };

  const handleType = (selectedType: string) => {
    setTypes(
      (prevTypes) =>
        prevTypes.includes(selectedType)
          ? prevTypes.filter((t) => t !== selectedType) // Remove if already selected
          : [...prevTypes, selectedType], // Add if not selected
    );
  };

  const handleInputChange = (index: number, value: string) => {
    const num = Number(value);
    const newRange: [number, number] = [...minMax];
    newRange[index] = Number.isNaN(num) ? minMax[index] : num;
    setMinMax(newRange);
  };

  return (
    <div className="fixed top-0 left-0 bg-overlay/40 h-dvh w-full z-30 flex justify-center items-end md:items-center">
      {/* Popup */}
      <div className="w-full h-[95%] md:w-[40%] bg-card text-card-foreground py-5 rounded-t-2xl md:rounded-xl">
        {/* Top elements */}
        <div>
          <div className="flex justify-between items-center w-[90%] md:w-full mx-auto font-semibold md:px-5">
            <button
              type="button"
              className="flex md:hidden"
              onClick={() => handlePopup(false)}
            >
              Cancel
            </button>

            <h1 className="md:mx-auto text-xl md:text-2xl">Filter</h1>

            <button
              onClick={handleReset}
              type="button"
              className="flex md:hidden"
            >
              Clear
            </button>

            <button
              type="button"
              className="hidden md:flex"
              onClick={() => handlePopup(false)}
            >
              <MaskIcon
                src="/assets/images/circularCancel.svg"
                alt="Cancel"
                className="w-[30px] h-[30px] bg-foreground"
              />
            </button>
          </div>

          <hr className="mt-3 border-border" />
        </div>

        {/* Content */}
        <div className="mt-5 w-[90%] md:w-full mx-auto md:px-5 space-y-5 overflow-y-scroll h-[90%]">
          <h2 className="font-semibold md:text-lg">Sort by</h2>

          <div className="space-y-5">
            {contentType === "events" && (
              <div>
                <div className="space-y-3">
                  {/* Price and inputs */}
                  <div className="flex justify-between items-center">
                    <p>Price</p>

                    <div className="flex gap-3 items-center">
                      <input
                        type="number"
                        value={minMax[0]}
                        min={0}
                        max={minMax[1]}
                        onChange={(e) => handleInputChange(0, e.target.value)}
                        className="w-20 h-8 text-center outline-none bg-muted rounded-lg"
                      />
                      <span>-</span>
                      <input
                        type="number"
                        value={minMax[1]}
                        min={minMax[0]}
                        max={99999}
                        onChange={(e) => handleInputChange(1, e.target.value)}
                        className="w-20 h-8 text-center outline-none bg-muted rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Range slider */}
                  <div className="flex justify-between items-center gap-3">
                    <p>${minMax[0]}</p>

                    <RangeSlider
                      min={0}
                      max={999}
                      step={1}
                      value={minMax}
                      onInput={(val) => setMinMax(val as [number, number])}
                      id="range-slider-yellow"
                    />

                    <p>${minMax[1] === 999 ? "Any" : minMax[1]}</p>
                  </div>
                </div>

                <hr className="mt-5 border-border" />
              </div>
            )}

            {/* category */}
            {contentType === "events" ? (
              <div>
                <CategoryFilter
                  handleCategory={handleCategory}
                  category={category}
                  classname="font-semibold md:text-lg"
                />

                <hr className="mt-5 border-border" />
              </div>
            ) : (
              <div>
                <PlaceCategoryPicker
                  categoryId={placeCategoryId}
                  onSelect={setPlaceCategoryId}
                />

                <hr className="mt-5 border-border" />
              </div>
            )}

            {/* types -- Events only, Places has no "types" concept */}
            {contentType === "events" && (
              <div>
                <TypeFilter
                  selectedTypes={types}
                  selectedCategory={category}
                  handleType={handleType}
                  classname="font-semibold md:text-lg"
                />

                <hr className="mt-5 border-border" />
              </div>
            )}

            {/* Open now -- Places only, per spec no "Event date" shown here */}
            {contentType === "places" && (
              <div>
                <label className="flex items-center justify-between font-semibold md:text-lg cursor-pointer">
                  <span>Open now</span>
                  <input
                    type="checkbox"
                    checked={openNowOnly}
                    onChange={(e) => setOpenNowOnly(e.target.checked)}
                    className="h-5 w-5 accent-primary"
                  />
                </label>

                <hr className="mt-5 border-border" />
              </div>
            )}

            {/* date -- Events only */}
            {contentType === "events" && (
              <div>
                <h2 className="font-semibold md:text-lg mb-5">Date</h2>

                <div className={cn("grid gap-2 border", className)}>
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={date?.from}
                    selected={date}
                    onSelect={setDate}
                    numberOfMonths={1}
                    classNames={{ root: "w-full" }}
                  />
                </div>

                <hr className="mt-5 border-border" />
              </div>
            )}
          </div>

          {/* Rating */}
          <div>
            <h2 className="font-semibold md:text-lg mb-5">Rating</h2>

            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {rating.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRating(r)}
                  className={cn(
                    "p-2 bg-muted rounded-md text-sm",
                    r === ratingg && "bg-primary text-primary-foreground",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>

            <hr className="mt-5 border-border" />
          </div>

          {/* Distance */}
          <div>
            <h2 className="font-semibold md:text-lg mb-5">Distance</h2>

            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              {distances.map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => setDistance(d)}
                  className={cn(
                    "p-2 bg-muted rounded-md text-sm",
                    distance === d && "bg-primary text-primary-foreground",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>

            <hr className="mt-5 border-border" />
          </div>

          <div className="gap-2 justify-end pb-3 hidden md:flex">
            <Button
              onClick={handleReset}
              className="text-lg py-5 px-7 rounded-md"
            >
              Reset
            </Button>
            <Button
              onClick={handleFilter}
              className="text-lg py-5 px-7 rounded-md"
            >
              Filter
            </Button>
          </div>

          <Button
            onClick={handleFilter}
            className="font-bold w-full rounded-md text-lg md:hidden p-6"
          >
            Filter
          </Button>
        </div>
      </div>
    </div>
  );
}
