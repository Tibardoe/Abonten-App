import {
  DISTANCE_OPTIONS,
  EMPTY_EVENT_FILTERS,
  EMPTY_PLACE_FILTERS,
  type EventFilters,
  PRICE_ANY_MAX,
  type PlaceFilters,
  RATING_OPTIONS,
  clearEventFilterKey,
  clearPlaceFilterKey,
  countActiveEventFilters,
  countActivePlaceFilters,
} from "@/features/discovery/exploreFilters";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import type { PlaceCategory } from "@abonten/types/placeType";
import { AppText, Button, Chip, Label, Sheet } from "@abonten/ui-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { DateRangeField } from "./DateRangeField";
import { PriceRangeField } from "./PriceRangeField";

// Native echo of apps/web/src/components/organisms/FilterModalPopup.tsx.
// Tab-aware: Category / Types / Price / Date / Rating / Distance for Events;
// Category / Open now / Rating / Distance for Places. Edits a local draft;
// "Apply" lifts it, "Clear all" resets to the EMPTY_* defaults.
//
// Layout notes: the sheet floats up to ~70% of the screen so the sections
// aren't buried; each group is a card-less block separated by a hairline
// with an active dot + inline "Clear"; the price slider owns its own
// horizontal pan (activeOffsetX / failOffsetY in PriceRangeField) so the
// parent sheet never scrolls while a thumb is dragged, and the chip groups
// wrap rather than scroll horizontally so there's no gesture contention.

function Section({
  label,
  hint,
  active,
  onClear,
  children,
  first,
}: {
  label: string;
  hint?: string;
  active?: boolean;
  onClear?: () => void;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <View className={first ? "gap-2.5" : "gap-2.5 border-t border-border pt-5"}>
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Label>{label}</Label>
          {active ? (
            <View className="h-1.5 w-1.5 rounded-full bg-primary" />
          ) : null}
        </View>
        {active && onClear ? (
          <Pressable
            onPress={onClear}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label} filter`}
          >
            <AppText variant="caption" tone="brand" className="font-semibold">
              Clear
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {hint ? (
        <AppText variant="caption" className="-mt-1">
          {hint}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}

export function FilterSheet({
  open,
  onClose,
  tab,
  eventFilters,
  placeFilters,
  placeCategories,
  onApplyEvents,
  onApplyPlaces,
}: {
  open: boolean;
  onClose: () => void;
  tab: "events" | "places";
  eventFilters: EventFilters;
  placeFilters: PlaceFilters;
  placeCategories: PlaceCategory[];
  onApplyEvents: (next: EventFilters) => void;
  onApplyPlaces: (next: PlaceFilters) => void;
}) {
  const [eDraft, setEDraft] = useState<EventFilters>(eventFilters);
  const [pDraft, setPDraft] = useState<PlaceFilters>(placeFilters);

  // Re-seed the draft whenever the sheet is (re)opened so it reflects the
  // filters currently applied, not a stale edit.
  useEffect(() => {
    if (open) {
      setEDraft(eventFilters);
      setPDraft(placeFilters);
    }
  }, [open, eventFilters, placeFilters]);

  const isEvents = tab === "events";
  const activeCount = isEvents
    ? countActiveEventFilters(eDraft)
    : countActivePlaceFilters(pDraft);
  const dirty = isEvents
    ? JSON.stringify(eDraft) !== JSON.stringify(eventFilters)
    : JSON.stringify(pDraft) !== JSON.stringify(placeFilters);

  const selectedCategoryTypes = isEvents
    ? (eventCategoriesAndTypes.find((c) => c.category === eDraft.category)
        ?.types ?? [])
    : [];

  function apply() {
    if (isEvents) onApplyEvents(eDraft);
    else onApplyPlaces(pDraft);
    onClose();
  }

  function clearAll() {
    if (isEvents) setEDraft(EMPTY_EVENT_FILTERS);
    else setPDraft(EMPTY_PLACE_FILTERS);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filters"
      minHeightRatio={0.7}
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
            <Button
              title="Clear all filters"
              variant="ghost"
              onPress={clearAll}
            />
          ) : null}
        </View>
      }
    >
      <View className="flex-row items-center justify-between pb-4">
        <AppText variant="meta">
          {activeCount === 0
            ? "No filters applied"
            : `${activeCount} filter${activeCount === 1 ? "" : "s"} set${dirty ? " · not applied yet" : ""}`}
        </AppText>
        {activeCount > 0 ? (
          <View className="rounded-full bg-primary px-2 py-0.5">
            <AppText className="text-[12px] font-bold text-primary-foreground">
              {activeCount}
            </AppText>
          </View>
        ) : null}
      </View>

      {isEvents ? (
        <View className="gap-5">
          <Section
            first
            label="Category"
            active={eDraft.category != null}
            onClear={() => setEDraft((d) => clearEventFilterKey(d, "category"))}
          >
            <Wrap>
              {eventCategoriesAndTypes.map((c) => (
                <Chip
                  key={c.category}
                  label={c.category}
                  selected={eDraft.category === c.category}
                  onPress={() =>
                    setEDraft((d) => ({
                      ...d,
                      category: d.category === c.category ? null : c.category,
                      types: d.category === c.category ? [] : d.types,
                    }))
                  }
                />
              ))}
            </Wrap>
          </Section>

          {eDraft.category ? (
            <Section
              label="Type"
              hint={`Types within ${eDraft.category}`}
              active={eDraft.types.length > 0}
              onClear={() => setEDraft((d) => ({ ...d, types: [] }))}
            >
              <Wrap>
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
              </Wrap>
            </Section>
          ) : null}

          <Section
            label="Price"
            hint="Ticket price in GHS"
            active={
              eDraft.minPrice != null ||
              (eDraft.maxPrice != null && eDraft.maxPrice < PRICE_ANY_MAX)
            }
            onClear={() => setEDraft((d) => clearEventFilterKey(d, "price"))}
          >
            <PriceRangeField
              min={eDraft.minPrice}
              max={eDraft.maxPrice}
              onChange={({ min, max }) =>
                setEDraft((d) => ({ ...d, minPrice: min, maxPrice: max }))
              }
            />
          </Section>

          <Section
            label="Dates"
            hint="Events with a session in this range"
            active={!!(eDraft.startDate || eDraft.endDate)}
            onClear={() => setEDraft((d) => clearEventFilterKey(d, "date"))}
          >
            <DateRangeField
              start={eDraft.startDate}
              end={eDraft.endDate}
              onChange={({ start, end }) =>
                setEDraft((d) => ({ ...d, startDate: start, endDate: end }))
              }
            />
          </Section>

          <Section
            label="Minimum rating"
            active={eDraft.minRating != null}
            onClear={() => setEDraft((d) => clearEventFilterKey(d, "rating"))}
          >
            <Wrap>
              {RATING_OPTIONS.map((r) => (
                <Chip
                  key={r.value}
                  label={r.label}
                  selected={eDraft.minRating === r.value}
                  onPress={() =>
                    setEDraft((d) => ({
                      ...d,
                      minRating: d.minRating === r.value ? null : r.value,
                    }))
                  }
                />
              ))}
            </Wrap>
          </Section>

          <Section
            label="Distance"
            active={eDraft.maxDistanceKm != null}
            onClear={() => setEDraft((d) => clearEventFilterKey(d, "distance"))}
          >
            <Wrap>
              {DISTANCE_OPTIONS.map((opt) => (
                <Chip
                  key={opt.km}
                  label={opt.label}
                  selected={eDraft.maxDistanceKm === opt.km}
                  onPress={() =>
                    setEDraft((d) => ({
                      ...d,
                      maxDistanceKm: d.maxDistanceKm === opt.km ? null : opt.km,
                    }))
                  }
                />
              ))}
            </Wrap>
          </Section>
        </View>
      ) : (
        <View className="gap-5">
          <Section
            first
            label="Category"
            active={pDraft.categoryId != null}
            onClear={() => setPDraft((d) => clearPlaceFilterKey(d, "category"))}
          >
            <Wrap>
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
            </Wrap>
          </Section>

          <Section
            label="Availability"
            active={pDraft.openNow}
            onClear={() => setPDraft((d) => clearPlaceFilterKey(d, "openNow"))}
          >
            <Wrap>
              <Chip
                label="Open now"
                selected={pDraft.openNow}
                onPress={() =>
                  setPDraft((d) => ({ ...d, openNow: !d.openNow }))
                }
              />
            </Wrap>
          </Section>

          <Section
            label="Minimum rating"
            active={pDraft.minRating != null}
            onClear={() => setPDraft((d) => clearPlaceFilterKey(d, "rating"))}
          >
            <Wrap>
              {RATING_OPTIONS.map((r) => (
                <Chip
                  key={r.value}
                  label={r.label}
                  selected={pDraft.minRating === r.value}
                  onPress={() =>
                    setPDraft((d) => ({
                      ...d,
                      minRating: d.minRating === r.value ? null : r.value,
                    }))
                  }
                />
              ))}
            </Wrap>
          </Section>

          <Section
            label="Distance"
            active={pDraft.maxDistanceKm != null}
            onClear={() => setPDraft((d) => clearPlaceFilterKey(d, "distance"))}
          >
            <Wrap>
              {DISTANCE_OPTIONS.map((opt) => (
                <Chip
                  key={opt.km}
                  label={opt.label}
                  selected={pDraft.maxDistanceKm === opt.km}
                  onPress={() =>
                    setPDraft((d) => ({
                      ...d,
                      maxDistanceKm: d.maxDistanceKm === opt.km ? null : opt.km,
                    }))
                  }
                />
              ))}
            </Wrap>
          </Section>
        </View>
      )}
    </Sheet>
  );
}
