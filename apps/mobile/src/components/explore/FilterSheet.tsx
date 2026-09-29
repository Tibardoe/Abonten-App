import {
  FilterChipRow,
  FilterChoices,
  FilterSection,
} from "@/components/filters/FilterSheetParts";
import {
  EMPTY_EVENT_FILTERS,
  EMPTY_PLACE_FILTERS,
  EXPLORE_EVENT_DISTANCE_OPTIONS,
  EXPLORE_PLACE_DISTANCE_OPTIONS,
  EXPLORE_RATING_OPTIONS,
  EXPLORE_WHEN_OPTIONS,
  type EventFilters,
  type ExplorePrice,
  type ExploreWhen,
  type PlaceFilters,
  clearEventFilterKey,
  clearPlaceFilterKey,
  countActiveEventFilters,
  countActivePlaceFilters,
  explorePriceFor,
  explorePriceOptions,
  explorePriceRange,
  exploreWhenFor,
  exploreWhenRange,
  withCurrentDistance,
} from "@/features/discovery/exploreFilters";
import { useMarket } from "@/features/markets/MarketProvider";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import type { PlaceCategory } from "@abonten/types/placeType";
import { AppText, Button, Chip, Sheet } from "@abonten/ui-native";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { DateRangeField } from "./DateRangeField";
import { PriceRangeField } from "./PriceRangeField";

// Explore's filters, in the same sheet style as Search's (SearchFilterSheet,
// shared parts in components/filters/FilterSheetParts): each section starts
// with its "any" choice, the common answers are one tap ("This weekend",
// "Free", "Within 2 km", "4+ stars"), and the precise controls (the
// calendar, the price slider) open only behind "Pick dates" / "Custom
// range". Events: When, Distance, Price, Category, Type, Rating. Places:
// Distance, Category, Open now, Rating. Edits a draft; "Show results"
// applies it, "Reset filters" empties it.
//
// The price slider owns its horizontal pan (activeOffsetX / failOffsetY in
// PriceRangeField) so the sheet never scrolls while a thumb is dragged.

export function FilterSheet({
  open,
  onClose,
  tab,
  eventFilters,
  placeFilters,
  placeCategories,
  onApplyEvents,
  onApplyPlaces,
  areaLabel,
}: {
  open: boolean;
  onClose: () => void;
  tab: "events" | "places";
  eventFilters: EventFilters;
  placeFilters: PlaceFilters;
  placeCategories: PlaceCategory[];
  onApplyEvents: (next: EventFilters) => void;
  onApplyPlaces: (next: PlaceFilters) => void;
  /** The area being browsed, for the distance hint ("From Osu"). */
  areaLabel?: string | null;
}) {
  const [eDraft, setEDraft] = useState<EventFilters>(eventFilters);
  const [pDraft, setPDraft] = useState<PlaceFilters>(placeFilters);
  // The When chip tapped in this sheet: dates alone can't tell "Today"
  // from "This weekend" on a Sunday, or show "Pick dates" before a day is
  // picked. Null = read it from the dates.
  const [whenChoice, setWhenChoice] = useState<ExploreWhen | null>(null);
  // "Custom range" chosen, possibly before the slider has moved.
  const [customPrice, setCustomPrice] = useState(false);
  const { market } = useMarket();
  const currency = market?.defaultCurrency ?? "";
  const priceScale = market?.priceScale ?? 1;

  // Every opening starts from what is applied, not from an abandoned draft.
  useEffect(() => {
    if (open) {
      setEDraft(eventFilters);
      setPDraft(placeFilters);
      setWhenChoice(null);
      setCustomPrice(false);
    }
  }, [open, eventFilters, placeFilters]);

  const isEvents = tab === "events";
  const activeCount = isEvents
    ? countActiveEventFilters(eDraft)
    : countActivePlaceFilters(pDraft);

  const when: ExploreWhen = whenChoice ?? exploreWhenFor(eDraft);
  const price: ExplorePrice = customPrice
    ? "custom"
    : explorePriceFor(eDraft, priceScale);
  const selectedCategoryTypes =
    eventCategoriesAndTypes.find((c) => c.category === eDraft.category)
      ?.types ?? [];
  const distanceHint = areaLabel ? `From ${areaLabel}` : undefined;

  function chooseWhen(next: ExploreWhen) {
    setWhenChoice(next);
    if (next === "dates") return;
    const range = exploreWhenRange(next);
    setEDraft((d) => ({
      ...d,
      startDate: range?.startDate ?? null,
      endDate: range?.endDate ?? null,
    }));
  }

  function choosePrice(next: ExplorePrice) {
    if (next === "custom") {
      setCustomPrice(true);
      return;
    }
    setCustomPrice(false);
    setEDraft((d) => ({ ...d, ...explorePriceRange(next, priceScale) }));
  }

  function apply() {
    if (isEvents) onApplyEvents(eDraft);
    else onApplyPlaces(pDraft);
    onClose();
  }

  function reset() {
    setWhenChoice(null);
    setCustomPrice(false);
    if (isEvents) setEDraft(EMPTY_EVENT_FILTERS);
    else setPDraft(EMPTY_PLACE_FILTERS);
  }

  const events = (
    <>
      <FilterSection
        first
        label="When"
        active={!!(eDraft.startDate || eDraft.endDate) || when === "dates"}
        onClear={() => {
          setWhenChoice(null);
          setEDraft((d) => clearEventFilterKey(d, "date"));
        }}
      >
        <FilterChoices
          options={EXPLORE_WHEN_OPTIONS}
          value={when}
          onChange={chooseWhen}
        />
        {when === "dates" ? (
          <View className="pt-1">
            <DateRangeField
              start={eDraft.startDate}
              end={eDraft.endDate}
              onChange={({ start, end }) =>
                setEDraft((d) => ({ ...d, startDate: start, endDate: end }))
              }
            />
          </View>
        ) : null}
      </FilterSection>

      <FilterSection
        label="Distance"
        hint={distanceHint}
        active={eDraft.maxDistanceKm != null}
        onClear={() => setEDraft((d) => clearEventFilterKey(d, "distance"))}
      >
        <FilterChoices
          options={withCurrentDistance(
            EXPLORE_EVENT_DISTANCE_OPTIONS,
            eDraft.maxDistanceKm,
          )}
          value={eDraft.maxDistanceKm}
          onChange={(v) => setEDraft((d) => ({ ...d, maxDistanceKm: v }))}
        />
      </FilterSection>

      <FilterSection
        label="Price"
        active={
          eDraft.minPrice != null ||
          eDraft.maxPrice != null ||
          price === "custom"
        }
        onClear={() => {
          setCustomPrice(false);
          setEDraft((d) => clearEventFilterKey(d, "price"));
        }}
      >
        <FilterChoices
          options={explorePriceOptions(currency, priceScale)}
          value={price}
          onChange={choosePrice}
        />
        {price === "custom" ? (
          <View className="pt-1">
            <PriceRangeField
              currency={currency}
              scale={priceScale}
              min={eDraft.minPrice}
              max={eDraft.maxPrice}
              onChange={({ min, max }) =>
                setEDraft((d) => ({ ...d, minPrice: min, maxPrice: max }))
              }
            />
          </View>
        ) : null}
      </FilterSection>

      <FilterSection
        label="Category"
        active={eDraft.category != null}
        onClear={() =>
          setEDraft((d) => ({
            ...clearEventFilterKey(d, "category"),
            types: [],
          }))
        }
      >
        <FilterChipRow>
          {eventCategoriesAndTypes.map((c) => (
            <Chip
              key={c.category}
              label={c.category}
              selected={eDraft.category === c.category}
              onPress={() =>
                setEDraft((d) => ({
                  ...d,
                  category: d.category === c.category ? null : c.category,
                  types: [],
                }))
              }
            />
          ))}
        </FilterChipRow>
      </FilterSection>

      {eDraft.category && selectedCategoryTypes.length > 0 ? (
        <FilterSection
          label="Type"
          hint={`Any number within ${eDraft.category}`}
          active={eDraft.types.length > 0}
          onClear={() => setEDraft((d) => ({ ...d, types: [] }))}
        >
          <FilterChipRow>
            {selectedCategoryTypes.map((type) => {
              const on = eDraft.types.includes(type);
              return (
                <Chip
                  key={type}
                  label={type}
                  selected={on}
                  onPress={() =>
                    setEDraft((d) => ({
                      ...d,
                      types: on
                        ? d.types.filter((t) => t !== type)
                        : [...d.types, type],
                    }))
                  }
                />
              );
            })}
          </FilterChipRow>
        </FilterSection>
      ) : null}

      <FilterSection
        label="Rating"
        active={eDraft.minRating != null}
        onClear={() => setEDraft((d) => clearEventFilterKey(d, "rating"))}
      >
        <FilterChoices
          options={EXPLORE_RATING_OPTIONS}
          value={eDraft.minRating}
          onChange={(v) => setEDraft((d) => ({ ...d, minRating: v }))}
        />
      </FilterSection>
    </>
  );

  const places = (
    <>
      <FilterSection
        first
        label="Distance"
        hint={distanceHint}
        active={pDraft.maxDistanceKm != null}
        onClear={() => setPDraft((d) => clearPlaceFilterKey(d, "distance"))}
      >
        <FilterChoices
          options={withCurrentDistance(
            EXPLORE_PLACE_DISTANCE_OPTIONS,
            pDraft.maxDistanceKm,
          )}
          value={pDraft.maxDistanceKm}
          onChange={(v) => setPDraft((d) => ({ ...d, maxDistanceKm: v }))}
        />
      </FilterSection>

      <FilterSection
        label="Category"
        active={pDraft.categoryId != null}
        onClear={() => setPDraft((d) => clearPlaceFilterKey(d, "category"))}
      >
        {placeCategories.length === 0 ? (
          <AppText variant="caption">
            Categories will load when you're online.
          </AppText>
        ) : (
          <FilterChipRow>
            {placeCategories.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={pDraft.categoryId === c.id}
                onPress={() =>
                  setPDraft((d) => ({
                    ...d,
                    categoryId: d.categoryId === c.id ? null : c.id,
                  }))
                }
              />
            ))}
          </FilterChipRow>
        )}
      </FilterSection>

      <FilterSection
        label="Open now"
        active={pDraft.openNow}
        onClear={() => setPDraft((d) => clearPlaceFilterKey(d, "openNow"))}
      >
        <View className="min-h-[44px] flex-row items-center justify-between">
          <AppText variant="body" className="flex-1">
            Only places open right now
          </AppText>
          <Switch
            value={pDraft.openNow}
            onValueChange={(v) => setPDraft((d) => ({ ...d, openNow: v }))}
            accessibilityLabel="Only places open right now"
          />
        </View>
      </FilterSection>

      <FilterSection
        label="Rating"
        active={pDraft.minRating != null}
        onClear={() => setPDraft((d) => clearPlaceFilterKey(d, "rating"))}
      >
        <FilterChoices
          options={EXPLORE_RATING_OPTIONS}
          value={pDraft.minRating}
          onChange={(v) => setPDraft((d) => ({ ...d, minRating: v }))}
        />
      </FilterSection>
    </>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEvents ? "Filter events" : "Filter places"}
      minHeightRatio={0.6}
      maxHeightRatio={0.92}
      footer={
        <View className="gap-2">
          <Button
            title={
              activeCount > 0
                ? `Show results · ${activeCount} filter${activeCount === 1 ? "" : "s"}`
                : "Show results"
            }
            onPress={apply}
          />
          {activeCount > 0 ? (
            <Button title="Reset filters" variant="ghost" onPress={reset} />
          ) : null}
        </View>
      }
    >
      <View className="gap-5 pb-2">{isEvents ? events : places}</View>
    </Sheet>
  );
}
