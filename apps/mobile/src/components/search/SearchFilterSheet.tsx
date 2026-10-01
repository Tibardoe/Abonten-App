import {
  FilterChipRow,
  FilterChoices,
  FilterSection,
} from "@/components/filters/FilterSheetParts";
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
import { AppText, Button, Chip, Sheet, Skeleton } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";

// Filters for global search — its own sheet, not the Explore one. It shows
// only the filters that narrow the tab you are on (Events: when, distance,
// price, category, rating; Places: distance, category, open now, rating;
// All: both), edits a draft, and applies it with "Show results". The query
// you typed is never touched. See @abonten/core/search/searchFilters for
// the model and what each filter sends.

const EVENT_CATEGORIES = eventCategoriesAndTypes.map((c) => c.category);

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
  const t = useTranslations("search");

  const [draft, setDraft] = useState(filters);
  const placeCategories = usePlaceCategories();
  // Price buckets read in the browsed market's currency ("Under ₦50").
  const { market } = useMarket();
  const priceOptions = searchPriceOptions(
    market?.defaultCurrency ?? "",
    market?.priceScale ?? 1,
  );
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
    <FilterSection
      key="when"
      label={t("when")}
      first={first}
      active={isActive("when")}
      onClear={() => clear("when")}
    >
      <FilterChoices
        options={SEARCH_WHEN_OPTIONS}
        value={draft.when}
        onChange={(v) => set("when", v)}
      />
    </FilterSection>
  ));

  push("radiusKm", (first) => (
    <FilterSection
      key="radius"
      label={t("distance")}
      hint={
        hasLocation
          ? t("from", { value: locationLabel ?? t("yourLocation") })
          : t("setYourLocationOnExploreTo")
      }
      first={first}
      active={isActive("radiusKm")}
      onClear={() => clear("radiusKm")}
    >
      <FilterChoices
        options={SEARCH_RADIUS_OPTIONS}
        value={draft.radiusKm}
        onChange={(v) => set("radiusKm", v)}
        disabled={!hasLocation}
      />
    </FilterSection>
  ));

  push("price", (first) => (
    <FilterSection
      key="price"
      label={t("price")}
      first={first}
      active={isActive("price")}
      onClear={() => clear("price")}
    >
      <FilterChoices
        options={priceOptions}
        value={draft.price}
        onChange={(v) => set("price", v)}
      />
    </FilterSection>
  ));

  push("eventCategory", (first) => (
    <FilterSection
      key="eventCategory"
      label={mode === "all" ? t("eventCategory") : t("category")}
      first={first}
      active={isActive("eventCategory")}
      onClear={() => clear("eventCategory")}
    >
      <FilterChipRow>
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
      </FilterChipRow>
    </FilterSection>
  ));

  push("placeCategoryId", (first) => (
    <FilterSection
      key="placeCategory"
      label={mode === "all" ? t("placeCategory") : t("category")}
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
        <AppText variant="caption">{t("categoriesWillLoadWhenYouRe")}</AppText>
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
    </FilterSection>
  ));

  push("openNow", (first) => (
    <FilterSection
      key="openNow"
      label={t("openNow")}
      first={first}
      active={isActive("openNow")}
      onClear={() => clear("openNow")}
    >
      <View className="min-h-[44px] flex-row items-center justify-between">
        <AppText variant="body" className="flex-1">
          {t("onlyPlacesOpenRightNow")}
        </AppText>
        <Switch
          value={draft.openNow}
          onValueChange={(v) => set("openNow", v)}
          accessibilityLabel={t("onlyPlacesOpenRightNow")}
        />
      </View>
    </FilterSection>
  ));

  push("minRating", (first) => (
    <FilterSection
      key="rating"
      label={t("rating")}
      first={first}
      active={isActive("minRating")}
      onClear={() => clear("minRating")}
    >
      <FilterChoices
        options={SEARCH_RATING_OPTIONS}
        value={draft.minRating}
        onChange={(v) => set("minRating", v)}
      />
    </FilterSection>
  ));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("filterResults")}
      minHeightRatio={0.6}
      maxHeightRatio={0.92}
      footer={
        <View className="gap-2">
          <Button
            title={
              activeCount > 0
                ? t("showResultsFilter", {
                    activeCount: activeCount,
                    value: activeCount === 1 ? "" : "s",
                  })
                : t("showResults")
            }
            onPress={() => {
              onApply(draft);
              onClose();
            }}
          />
          {activeCount > 0 ? (
            <Button
              title={t("resetFilters")}
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
            {t("organizerResultsCanTBeFiltered")}
          </AppText>
        )}
      </View>
    </Sheet>
  );
}
