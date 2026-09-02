import { EventCard, EventCardSkeleton } from "@/components/EventCard";
import { ActiveFilterChips } from "@/components/explore/ActiveFilterChips";
import { FilterSheet } from "@/components/explore/FilterSheet";
import {
  EMPTY_EVENT_FILTERS,
  EMPTY_PLACE_FILTERS,
  type EventFilters,
  clearEventFilterKey,
  countActiveEventFilters,
  describeEventFilters,
} from "@/features/discovery/exploreFilters";
import { useRecentSearches } from "@/features/search/recentSearches";
import { useEventSearch } from "@/features/search/useEventSearch";
import { useSearchSuggestions } from "@/features/search/useSearchSuggestions";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import type { UserPostType } from "@abonten/types/postsType";
import type { EventSuggestion } from "@abonten/types/searchSuggestionType";
import {
  AppText,
  Chip,
  EmptyState,
  Icon,
  Overline,
  Skeleton,
  Spinner,
} from "@abonten/ui-native";
import { family, useThemeColors } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BROWSE_CATEGORIES = eventCategoriesAndTypes
  .map((c) => c.category)
  .slice(0, 8);
const ALL_CATEGORY_NAMES = eventCategoriesAndTypes.map((c) => c.category);

// Dedicated Search experience — the native counterpart of the web /search
// route (which now owns search after Phase 2 pulled the bar off Explore).
// No nav header: the search field sits at the very top, immediately
// reachable. Idle -> recent searches + browse-category shortcuts; typing
// -> live event / category suggestions + a "search for …" row (same
// grouping the web SearchSuggestionsDropdown uses); submit -> the filtered
// results list.

function SuggestionRow({
  icon,
  title,
  subtitle,
  imageUri,
  onPress,
  onRemove,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  subtitle?: string;
  imageUri?: string | null;
  onPress: () => void;
  onRemove?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-3 rounded-lg px-1 py-2 active:opacity-70"
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: 40, height: 40, borderRadius: 8 }}
          contentFit="cover"
        />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-muted">
          <Icon name={icon} size={18} tone="muted" />
        </View>
      )}
      <View className="flex-1">
        <AppText variant="body" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="meta" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${title} from recent searches`}
          hitSlop={10}
          onPress={onRemove}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
        >
          <Icon name="close" size={16} tone="muted" />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function SectionHeader({
  label,
  action,
}: {
  label: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="mt-3 mb-1 flex-row items-center justify-between px-1">
      <Overline>{label}</Overline>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <AppText variant="small" tone="brand" className="font-medium">
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function Search() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const c = useThemeColors();
  const inputRef = useRef<TextInput>(null);

  const [raw, setRaw] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [filters, setFilters] = useState<EventFilters>(EMPTY_EVENT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const { recents, add, remove, clear } = useRecentSearches();
  const suggest = useSearchSuggestions(raw);
  const results = useEventSearch(submitted ?? "", filters);

  const trimmed = raw.trim();
  const typing = trimmed.length >= 2;
  const activeFilterCount = countActiveEventFilters(filters);
  const filterChips = useMemo(() => describeEventFilters(filters), [filters]);

  const showResults =
    (submitted != null && submitted === trimmed) ||
    (activeFilterCount > 0 && !typing);
  const mode: "idle" | "suggestions" | "results" = showResults
    ? "results"
    : typing
      ? "suggestions"
      : "idle";

  const categoryMatches = useMemo(
    () =>
      typing
        ? ALL_CATEGORY_NAMES.filter((n) =>
            n.toLowerCase().includes(trimmed.toLowerCase()),
          ).slice(0, 4)
        : [],
    [typing, trimmed],
  );

  const runSearch = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q) return;
      setRaw(q);
      setSubmitted(q);
      add(q);
      inputRef.current?.blur();
      Keyboard.dismiss();
    },
    [add],
  );

  const openEvent = useCallback(
    (id: string) => router.push(`/(app)/event/${id}`),
    [router],
  );

  const resultRows: UserPostType[] =
    results.data?.pages.flatMap((p) => p.rows) ?? [];

  const onEndReached = useCallback(() => {
    if (results.hasNextPage && !results.isFetchingNextPage)
      results.fetchNextPage();
  }, [results]);

  const clearInput = () => {
    setRaw("");
    setSubmitted(null);
    inputRef.current?.focus();
  };

  return (
    <View className="flex-1 bg-background">
      {/* Search bar — pinned to the very top, below the status bar only. */}
      <View
        style={{ paddingTop: insets.top + 8 }}
        className="border-b border-border bg-background px-4 pb-3"
      >
        <View className="flex-row items-center gap-2">
          <View className="h-11 flex-1 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3">
            <Icon name="search-outline" size={18} tone="muted" />
            <TextInput
              ref={inputRef}
              placeholder="Search events…"
              placeholderTextColor={c["muted-foreground"]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              value={raw}
              onChangeText={(text) => {
                setRaw(text);
                if (submitted != null) setSubmitted(null);
              }}
              onSubmitEditing={() => runSearch(raw)}
              className="flex-1 text-[15px] text-foreground"
              style={family.body ? { fontFamily: family.body } : undefined}
            />
            {raw.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                hitSlop={10}
                onPress={clearInput}
                className="h-7 w-7 items-center justify-center rounded-full active:opacity-60"
              >
                <Icon name="close-circle" size={18} tone="muted" />
              </Pressable>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              activeFilterCount > 0
                ? `Filters (${activeFilterCount} active)`
                : "Filters"
            }
            onPress={() => setFilterOpen(true)}
            className="h-11 flex-row items-center gap-1 rounded-xl border border-border px-3 active:opacity-70"
          >
            <Icon name="options-outline" size={18} tone="foreground" />
            {activeFilterCount > 0 ? (
              <View className="min-w-[18px] items-center rounded-full bg-primary px-1">
                <AppText className="text-[12px] font-semibold text-primary-foreground">
                  {activeFilterCount}
                </AppText>
              </View>
            ) : null}
          </Pressable>
        </View>
      </View>

      {mode === "results" ? (
        <FlatList
          data={resultRows}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <EventCard event={item} />}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-4 px-4 pb-16 pt-3"
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            filterChips.length > 0 ? (
              <ActiveFilterChips
                chips={filterChips}
                onRemove={(key) =>
                  setFilters((f) => clearEventFilterKey(f, key))
                }
                onClearAll={() => setFilters(EMPTY_EVENT_FILTERS)}
              />
            ) : null
          }
          ListEmptyComponent={
            results.isLoading ? (
              <View className="gap-4 px-1 pt-2">
                {["a", "b", "c"].map((k) => (
                  <EventCardSkeleton key={k} />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="search-outline"
                title={results.isError ? "Search failed" : "No matching events"}
                description={
                  results.isError
                    ? "Pull to refresh or try a different search."
                    : "Try a different term or clear your filters."
                }
                actionLabel={
                  activeFilterCount > 0 ? "Clear filters" : undefined
                }
                onAction={
                  activeFilterCount > 0
                    ? () => setFilters(EMPTY_EVENT_FILTERS)
                    : undefined
                }
              />
            )
          }
          ListFooterComponent={results.isFetchingNextPage ? <Spinner /> : null}
        />
      ) : mode === "suggestions" ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="px-4 pb-16 pt-1"
        >
          {suggest.isLoading && suggest.events.length === 0 ? (
            <View className="gap-3 pt-3">
              {["a", "b", "c"].map((k) => (
                <View key={k} className="flex-row items-center gap-3">
                  <Skeleton width={40} height={40} radius={8} />
                  <View className="flex-1 gap-1.5">
                    <Skeleton width="70%" height={12} />
                    <Skeleton width="40%" height={10} />
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {suggest.events.length > 0 ? (
            <>
              <SectionHeader label="Events" />
              {suggest.events.map((event: EventSuggestion) => (
                <SuggestionRow
                  key={event.id}
                  icon="calendar-outline"
                  title={event.title}
                  subtitle={
                    event.starts_at
                      ? formatDateWithSuffix(event.starts_at)
                      : event.event_category
                  }
                  imageUri={
                    event.flyer_public_id && event.flyer_version
                      ? buildCloudinaryUrl(
                          event.flyer_public_id,
                          event.flyer_version,
                          { width: 80, height: 80 },
                        )
                      : null
                  }
                  onPress={() => openEvent(event.id)}
                />
              ))}
            </>
          ) : null}

          {categoryMatches.length > 0 ? (
            <>
              <SectionHeader label="Categories" />
              {categoryMatches.map((name) => (
                <SuggestionRow
                  key={name}
                  icon="pricetag-outline"
                  title={name}
                  onPress={() => runSearch(name)}
                />
              ))}
            </>
          ) : null}

          {!suggest.isLoading &&
          suggest.query === trimmed &&
          suggest.events.length === 0 &&
          categoryMatches.length === 0 ? (
            <AppText variant="muted" className="px-1 pt-3">
              {suggest.isError
                ? "Couldn't load suggestions."
                : "No matching events or categories."}
            </AppText>
          ) : null}

          <View className="mt-1 border-t border-border pt-1">
            <SuggestionRow
              icon="search-outline"
              title={`Search for “${trimmed}”`}
              onPress={() => runSearch(trimmed)}
            />
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-4 pb-16 pt-1"
        >
          {recents.length > 0 ? (
            <>
              <SectionHeader
                label="Recent"
                action={{ label: "Clear all", onPress: clear }}
              />
              {recents.map((text) => (
                <SuggestionRow
                  key={text}
                  icon="time-outline"
                  title={text}
                  onPress={() => runSearch(text)}
                  onRemove={() => remove(text)}
                />
              ))}
            </>
          ) : (
            <>
              <SectionHeader label="Browse categories" />
              <View className="flex-row flex-wrap gap-2 px-1 pt-1">
                {BROWSE_CATEGORIES.map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    onPress={() => runSearch(name)}
                  />
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        tab="events"
        eventFilters={filters}
        placeFilters={EMPTY_PLACE_FILTERS}
        placeCategories={[]}
        onApplyEvents={setFilters}
        onApplyPlaces={() => {}}
      />
    </View>
  );
}
