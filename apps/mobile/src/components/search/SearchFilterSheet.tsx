import { usePlaceCategories } from "@/features/discovery/usePlaceCategories";
import { useMarket } from "@/features/markets/MarketProvider";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import {
  SEARCH_RADIUS_OPTIONS,
  SEARCH_RATING_OPTIONS,
  SEARCH_WHEN_OPTIONS,
  type SearchFilterKey,
  type SearchFilters,
  activeSearchFilters,
  clearSearchFilter,
  clearSearchFiltersFor,
  searchFiltersFor,
  searchPriceOptions,
} from "@abonten/core/search/searchFilters";
import type { SearchMode } from "@abonten/types/searchType";
import {
  AppText,
  Button,
  Chip,
  Label,
  Sheet,
  Skeleton,
} from "@abonten/ui-native";
import { useEffect, useState } from "react";
import { Pressable, Switch, View } from "react-native";

// Filters for global search — its own sheet, not the Explore one. It shows
// only the filters that narrow the tab you are on (Events: when, distance,
// price, category, rating; Places: distance, category, open now, rating;
// All: both), edits a draft, and applies it with "Show results". The query
// you typed is never touched. See @abonten/core/search/searchFilters for
// the model and what each filter sends.

const EVENT_CATEGORIES = eventCategoriesAndTypes.map((c) => c.category);

function Section({
  label,
  hint,
  active,
  onClear,
  first,
  children,
}: {
  label: string;
  hint?: string;
  active: boolean;
  onClear: () => void;
  first?: boolean;
  children: React.ReactNode;
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
        {active ? (
          <Pressable
            onPress={onClear}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
            className="min-h-[32px] justify-center"
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

function Choices<T>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <View
      className="flex-row flex-wrap gap-2"
      style={disabled ? { opacity: 0.45 } : undefined}
      pointerEvents={disabled ? "none" : "auto"}
      accessibilityState={{ disabled: !!disabled }}
    >
      {options.map((o) => (
        <Chip
          key={String(o.value)}
          label={o.label}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

export function SearchFilterSheet({
  open,
  onClose,
  mode,
  filters,
  onApply,
  locationLabel,
  hasLocation,
}: {
  open: boolean;
  onClose: () => void;
  mode: SearchMode;
  filters: SearchFilters;
  onApply: (next: SearchFilters) => void;
  locationLabel: string | null;
  hasLocation: boolean;
}) {
  const [draft, setDraft] = useState(filters);
  const placeCategories = usePlaceCategories();
  // Price buckets read in the browsed market's currency ("Under ₦50").
  const { market } = useMarket();
  const priceOptions = searchPriceOptions(market?.defaultCurrency ?? "");
  const offered = new Set(searchFiltersFor(mode));
  const activeCount = activeSearchFilters(draft, mode).length;

  // Every opening starts from what is applied, not from an abandoned draft.
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  const set = <K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const isActive = (k: SearchFilterKey) =>
    activeSearchFilters(draft, mode).includes(k);
  const clear = (k: SearchFilterKey) =>
    setDraft((d) => clearSearchFilter(d, k));

  const sections: React.ReactNode[] = [];
  const push = (
    key: SearchFilterKey,
    node: (first: boolean) => React.ReactNode,
  ) => {
    if (offered.has(key)) sections.push(node(sections.length === 0));
  };

  push("when", (first) => (
    <Section
      key="when"
      label="When"
      first={first}
      active={isActive("when")}
      onClear={() => clear("when")}
    >
      <Choices
        options={SEARCH_WHEN_OPTIONS}
        value={draft.when}
        onChange={(v) => set("when", v)}
      />
    </Section>
  ));

  push("radiusKm", (first) => (
    <Section
      key="radius"
      label="Distance"
      hint={
        hasLocation
          ? `From ${locationLabel ?? "your location"}`
          : "Set your location on Explore to search by distance."
      }
      first={first}
      active={isActive("radiusKm")}
      onClear={() => clear("radiusKm")}
    >
      <Choices
        options={SEARCH_RADIUS_OPTIONS}
        value={draft.radiusKm}
        onChange={(v) => set("radiusKm", v)}
        disabled={!hasLocation}
      />
    </Section>
  ));

  push("price", (first) => (
    <Section
      key="price"
      label="Price"
      first={first}
      active={isActive("price")}
      onClear={() => clear("price")}
    >
      <Choices
        options={priceOptions}
        value={draft.price}
        onChange={(v) => set("price", v)}
      />
    </Section>
  ));

  push("eventCategory", (first) => (
    <Section
      key="eventCategory"
      label={mode === "all" ? "Event category" : "Category"}
      first={first}
      active={isActive("eventCategory")}
      onClear={() => clear("eventCategory")}
    >
      <View className="flex-row flex-wrap gap-2">
        {EVENT_CATEGORIES.map((name) => (
          <Chip
            key={name}
            label={name}
            selected={draft.eventCategory === name}
            onPress={() =>
              set("eventCategory", draft.eventCategory === name ? null : name)
            }
          />
        ))}
      </View>
    </Section>
  ));

  push("placeCategoryId", (first) => (
    <Section
      key="placeCategory"
      label={mode === "all" ? "Place category" : "Category"}
      first={first}
      active={isActive("placeCategoryId")}
      onClear={() => clear("placeCategoryId")}
    >
      {placeCategories.isLoading ? (
        <View className="flex-row flex-wrap gap-2">
          {["a", "b", "c", "d"].map((k) => (
            <Skeleton key={k} width={84} height={32} radius={16} />
          ))}
        </View>
      ) : (placeCategories.data ?? []).length === 0 ? (
        <AppText variant="caption">
          Categories will load when you're online.
        </AppText>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {(placeCategories.data ?? []).map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              selected={draft.placeCategoryId === c.id}
              onPress={() =>
                setDraft((d) =>
                  d.placeCategoryId === c.id
                    ? { ...d, placeCategoryId: null, placeCategoryName: null }
                    : {
                        ...d,
                        placeCategoryId: c.id,
                        placeCategoryName: c.name,
                      },
                )
              }
            />
          ))}
        </View>
      )}
    </Section>
  ));

  push("openNow", (first) => (
    <Section
      key="openNow"
      label="Open now"
      first={first}
      active={isActive("openNow")}
      onClear={() => clear("openNow")}
    >
      <View className="min-h-[44px] flex-row items-center justify-between">
        <AppText variant="body" className="flex-1">
          Only places open right now
        </AppText>
        <Switch
          value={draft.openNow}
          onValueChange={(v) => set("openNow", v)}
          accessibilityLabel="Only places open right now"
        />
      </View>
    </Section>
  ));

  push("minRating", (first) => (
    <Section
      key="rating"
      label="Rating"
      first={first}
      active={isActive("minRating")}
      onClear={() => clear("minRating")}
    >
      <Choices
        options={SEARCH_RATING_OPTIONS}
        value={draft.minRating}
        onChange={(v) => set("minRating", v)}
      />
    </Section>
  ));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter results"
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
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          />
          {activeCount > 0 ? (
            <Button
              title="Reset filters"
              variant="ghost"
              onPress={() => setDraft((d) => clearSearchFiltersFor(d, mode))}
            />
          ) : null}
        </View>
      }
    >
      <View className="gap-5 pb-2">
        {sections.length > 0 ? (
          sections
        ) : (
          <AppText variant="muted">
            Organizer results can't be filtered. Switch to Events or Places to
            narrow them down.
          </AppText>
        )}
      </View>
    </Sheet>
  );
}
