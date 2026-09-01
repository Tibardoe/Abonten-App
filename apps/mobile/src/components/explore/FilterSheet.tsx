import {
  DISTANCE_OPTIONS,
  EMPTY_EVENT_FILTERS,
  EMPTY_PLACE_FILTERS,
  type EventFilters,
  type PlaceFilters,
  RATING_OPTIONS,
} from "@/features/discovery/exploreFilters";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import type { PlaceCategory } from "@abonten/types/placeType";
import { Button, Chip, Label, Sheet } from "@abonten/ui-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { DateRangeField } from "./DateRangeField";
import { PriceRangeField } from "./PriceRangeField";

// Native echo of apps/web/src/components/organisms/FilterModalPopup.tsx.
// Tab-aware, same as the web modal: Category / Types / Price / Date /
// Rating / Distance for Events; Category / Open now / Rating / Distance for
// Places. Edits a local draft; "Apply" lifts it, "Clear all" resets to the
// EMPTY_* defaults.

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2">
      <Label>{label}</Label>
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
  // filters currently applied, not a stale edit — same as the web modal's
  // initial* props.
  useEffect(() => {
    if (open) {
      setEDraft(eventFilters);
      setPDraft(placeFilters);
    }
  }, [open, eventFilters, placeFilters]);

  const isEvents = tab === "events";

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
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button title="Clear all" variant="outline" onPress={clearAll} />
          </View>
          <View className="flex-1">
            <Button title="Apply" onPress={apply} />
          </View>
        </View>
      }
    >
      {isEvents ? (
        <View className="gap-5">
          <Section label="Category">
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
                      // Dropping the category drops its type selection too.
                      types: d.category === c.category ? [] : d.types,
                    }))
                  }
                />
              ))}
            </Wrap>
          </Section>

          {eDraft.category ? (
            <Section label="Type">
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

          <Section label="Price (GHS)">
            <PriceRangeField
              min={eDraft.minPrice}
              max={eDraft.maxPrice}
              onChange={({ min, max }) =>
                setEDraft((d) => ({ ...d, minPrice: min, maxPrice: max }))
              }
            />
          </Section>

          <Section label="Date range">
            <DateRangeField
              start={eDraft.startDate}
              end={eDraft.endDate}
              onChange={({ start, end }) =>
                setEDraft((d) => ({ ...d, startDate: start, endDate: end }))
              }
            />
          </Section>

          <Section label="Minimum rating">
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

          <Section label="Distance">
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
          <Section label="Category">
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

          <Section label="Availability">
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

          <Section label="Minimum rating">
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

          <Section label="Distance">
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
