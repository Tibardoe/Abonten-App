import { EventCard, EventCardSkeleton } from "@/components/EventCard";
import { PlaceCard } from "@/components/PlaceCard";
import { useTabBarListPadding } from "@/components/app/GlassTabBar";
import { ActiveFilterChips } from "@/components/explore/ActiveFilterChips";
import { SpotlightTileRow } from "@/components/profile/SpotlightGrid";
import { useContentProgram } from "@/features/content/useContentProgram";
import { useExploreLocation } from "@/features/discovery/ExploreLocationProvider";
import { useDiscoveryProgram } from "@/features/discovery/useDiscoveryProgram";
import { useMarket } from "@/features/markets/MarketProvider";
import { useRecentSearches } from "@/features/search/recentSearches";
import {
  logSearchOpen,
  useSpotlightSearch,
  useUnifiedResults,
  useUnifiedSuggestions,
} from "@/features/search/useUnifiedSearch";
import { useQueryView } from "@/lib/useQueryView";
import {
  eventCategoryLabel,
  placeCategoryLabel,
} from "@abonten/core/categoryLabels";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import {
  chunkRows,
  tileFromDocument,
} from "@abonten/core/content/profileContent";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import { foldedIncludes } from "@abonten/core/search/foldSearchText";
import {
  isSearchableQuery,
  parseSearchQuery,
} from "@abonten/core/search/parseSearchQuery";
import {
  type SearchFilterKey,
  type SearchFilters,
  activeSearchFilters,
  canBrowseWithoutQuery,
  clearSearchFilter,
  clearSearchFiltersFor,
  describeSearchFilters,
  searchFiltersFromParams,
  searchFiltersToParams,
  searchFiltersToRequest,
} from "@abonten/core/search/searchFilters";
import type { ContentPostDocument } from "@abonten/types/contentType";
import type {
  SearchMode,
  SearchOrganizerHit,
  SearchResults,
  SearchSuggestion,
} from "@abonten/types/searchType";
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  Icon,
  ListFooter,
  Overline,
  SegmentedTabs,
  Skeleton,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { family, useThemeColors } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OrganizerRow } from "./OrganizerRow";
import { SearchFilterSheet } from "./SearchFilterSheet";

// The unified Search tab (Discovery): one box for events, places,
// organizers and Spotlights, "@handle" for organizers only. Idle shows
// recent searches and categories; typing shows grouped suggestions;
// submitting shows ranked results with All / Events / Places / Organizers /
// Spotlights tabs. The legacy events-only screen is still used while the
// programme is off.
//
// Filters (the button beside the box) are search's own
// (@abonten/core/search/searchFilters + SearchFilterSheet), not Explore's:
// each tab is narrowed only by the filters that apply to it, the typed query
// is never changed by filtering, and the state is mirrored into the route
// params so a filtered search can be linked to and survives re-renders.

const BROWSE_CATEGORIES = eventCategoriesAndTypes
  .map((c) => c.category)
  .slice(0, 8);
const ALL_CATEGORY_NAMES = eventCategoriesAndTypes.map((c) => c.category);

/** Server modes plus Spotlights, which come from the content search. */
type Tab = SearchMode | "spotlights";

/** Every route param the filters use (cleared before the current set). */
const SEARCH_PARAM_KEYS = [
  "when",
  "km",
  "price",
  "cat",
  "pcat",
  "pcatName",
  "open",
  "rating",
] as const;

type Row =
  | {
      kind: "section";
      key: string;
      label: string;
      action?: { label: string; mode: Tab };
    }
  | { kind: "spotlights"; key: string; posts: ContentPostDocument[] }
  | {
      kind: "event";
      key: string;
      hit: SearchResults["events"]["items"][number];
      rank: number;
    }
  | {
      kind: "place";
      key: string;
      hit: SearchResults["places"]["items"][number];
      rank: number;
    }
  | { kind: "organizer"; key: string; hit: SearchOrganizerHit; rank: number };

function SuggestionRow({
  icon,
  title,
  subtitle,
  imageUri,
  verified,
  onPress,
  onRemove,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  title: string;
  subtitle?: string | null;
  imageUri?: string | null;
  verified?: boolean;
  onPress: () => void;
  onRemove?: () => void;
}) {
  const t = useTranslations("search");

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-3 rounded-lg px-1 py-2 active:opacity-70"
    >
      {/* The icon stays underneath, so a missing or failed image still
          shows a tile instead of an empty gap. */}
      <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-muted">
        <Icon name={icon} size={18} tone="muted" />
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={{ position: "absolute", width: 40, height: 40 }}
            contentFit="cover"
          />
        ) : null}
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-1">
          <AppText variant="body" numberOfLines={1} className="shrink">
            {title}
          </AppText>
          {verified ? (
            <Icon name="checkmark-circle" size={14} tone="primary" />
          ) : null}
        </View>
        {subtitle ? (
          <AppText variant="meta" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("removeFromRecentSearches", { title: title })}
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
}: { label: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View className="mb-1 mt-3 flex-row items-center justify-between px-1">
      <Overline>{label}</Overline>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          hitSlop={8}
        >
          <AppText variant="small" tone="brand" className="font-medium">
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const thumb = (s: SearchSuggestion) =>
  s.imagePublicId
    ? buildCloudinaryUrl(s.imagePublicId, s.imageVersion ?? undefined, {
        width: 80,
        height: 80,
      })
    : null;

export function UnifiedSearch() {
  const { locale } = useLocale();

  const t = useTranslations("search");
  const tc = useTranslations("core");

  const listPadding = useTabBarListPadding();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const c = useThemeColors();
  const inputRef = useRef<TextInput>(null);
  const { program } = useDiscoveryProgram();
  const { program: content } = useContentProgram();
  const { area } = useExploreLocation();
  const { market } = useMarket();
  const marketCurrency = market?.defaultCurrency ?? "";
  const params = useLocalSearchParams<Record<string, string>>();

  // A link (or a remount) can carry the search: ?q=…&when=weekend&km=10…
  const [raw, setRaw] = useState(() => params.q ?? "");
  const [submitted, setSubmitted] = useState<string | null>(
    () => params.q || null,
  );
  const [mode, setMode] = useState<Tab>("all");
  const [scope, setScope] = useState<{ id: string; username: string } | null>(
    null,
  );
  const [filters, setFilters] = useState<SearchFilters>(() =>
    searchFiltersFromParams(params),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const { recents, add, remove, clear } = useRecentSearches();

  // Mirror the applied search into the route, so it is linkable and the
  // tab keeps it; params only change on submit / apply, never per keystroke.
  useEffect(() => {
    const cleared: Record<string, string | undefined> = { q: undefined };
    for (const k of SEARCH_PARAM_KEYS) cleared[k] = undefined;
    router.setParams({
      ...cleared,
      ...(submitted ? { q: submitted } : {}),
      ...searchFiltersToParams(filters),
    } as never);
  }, [submitted, filters, router]);

  const types = useMemo(
    () => [
      "event",
      ...(program.placeSearch ? ["place"] : []),
      ...(program.organizerSearch ? ["organizer"] : []),
    ],
    [program.placeSearch, program.organizerSearch],
  );
  const suggest = useUnifiedSuggestions(raw, { types });

  const parsed = parseSearchQuery(raw);
  const typing = isSearchableQuery(parsed);
  const organizerQuery = parsed.kind === "organizer";
  const trimmed = raw.trim();
  const spotlightTab = mode === "spotlights";
  const effectiveMode: SearchMode = scope
    ? "events"
    : spotlightTab
      ? "all"
      : mode;
  const hasQuery = submitted != null && submitted === trimmed;
  // With no text, a category filter is enough to browse its tab.
  const showResults =
    hasQuery ||
    scope != null ||
    (trimmed === "" && canBrowseWithoutQuery(filters, effectiveMode));

  // Distance needs a real position; ranking uses any known one.
  const lat = area?.lat;
  const lng = area?.lng;
  const origin = useMemo(
    () => (lat != null && lng != null ? { lat, lng } : null),
    [lat, lng],
  );
  const hasRealLocation = !!area && !area.isFallback;
  const filterRequest = useMemo(
    () =>
      searchFiltersToRequest(
        hasRealLocation ? filters : { ...filters, radiusKm: null },
        effectiveMode,
        new Date(),
        origin,
        market?.defaultTimeZone ?? "UTC",
        market?.priceScale ?? 1,
      ),
    [
      filters,
      effectiveMode,
      hasRealLocation,
      origin,
      market?.defaultTimeZone,
      market?.priceScale,
    ],
  );
  const filterChips = useMemo(
    () =>
      describeSearchFilters(
        { t: tc, locale },
        filters,
        effectiveMode,
        hasRealLocation ? area?.label : null,
        marketCurrency,
        market?.priceScale ?? 1,
      ).filter((c) => c.key !== "radiusKm" || hasRealLocation),
    [
      filters,
      effectiveMode,
      hasRealLocation,
      area?.label,
      marketCurrency,
      market?.priceScale,
      locale,
      tc,
    ],
  );
  const activeFilterCount = activeSearchFilters(
    filters,
    showResults ? effectiveMode : "all",
  ).filter((k) => k !== "radiusKm" || hasRealLocation).length;

  const results = useUnifiedResults({
    q: scope ? "" : (submitted ?? ""),
    mode: effectiveMode,
    organizerId: scope?.id,
    filters: filterRequest,
    enabled: showResults && !spotlightTab,
  });
  const spotlight = useSpotlightSearch(
    submitted ?? "",
    content.spotlight &&
      hasQuery &&
      !scope &&
      (mode === "all" || spotlightTab) &&
      parseSearchQuery(submitted ?? "").kind !== "organizer",
  );

  const firstPage = results.data?.pages[0];
  const searchId = firstPage?.searchId ?? null;

  const runSearch = useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q) return;
      setRaw(q);
      setSubmitted(q);
      setScope(null);
      setMode(parseSearchQuery(q).kind === "organizer" ? "organizers" : "all");
      add(q);
      inputRef.current?.blur();
      Keyboard.dismiss();
    },
    [add],
  );

  const openSuggestion = (s: SearchSuggestion) => {
    const group =
      s.entityType === "event"
        ? suggest.events
        : s.entityType === "place"
          ? suggest.places
          : suggest.organizers;
    logSearchOpen(
      suggest.searchId,
      s.entityType,
      s.id,
      Math.max(
        0,
        group.findIndex((g) => g.id === s.id),
      ),
    );
    add(s.entityType === "organizer" ? `@${s.label}` : s.label);
    if (s.entityType === "event") router.push(`/(app)/event/${s.id}`);
    else if (s.entityType === "place") router.push(`/(app)/place/${s.id}`);
    else router.push(`/(app)/user/${s.slug ?? s.label}`);
  };

  const clearInput = () => {
    setRaw("");
    setSubmitted(null);
    setScope(null);
    inputRef.current?.focus();
  };

  const tabs = useMemo(() => {
    const all: { key: Tab; label: string }[] = [
      { key: "all", label: t("all") },
      { key: "events", label: t("events") },
      ...(program.placeSearch
        ? [{ key: "places" as const, label: t("places") }]
        : []),
      ...(program.organizerSearch
        ? [{ key: "organizers" as const, label: t("organizers") }]
        : []),
      ...(content.spotlight && hasQuery
        ? [{ key: "spotlights" as const, label: t("spotlights") }]
        : []),
    ];
    return parseSearchQuery(submitted ?? "").kind === "organizer"
      ? all.filter((t) => t.key === "organizers")
      : all;
  }, [
    program.placeSearch,
    program.organizerSearch,
    content.spotlight,
    hasQuery,
    submitted,
    t,
  ]);

  const spotlightPosts = spotlight.data ?? [];

  const rows: Row[] = useMemo(() => {
    if (spotlightTab) {
      return chunkRows(spotlightPosts, 3).map((posts, i) => ({
        kind: "spotlights" as const,
        key: `sp-${i}`,
        posts,
      }));
    }
    const pages = results.data?.pages ?? [];
    if (pages.length === 0) return [];
    if (effectiveMode === "all") {
      const p = pages[0];
      const out: Row[] = [];
      if (p.events.items.length) {
        out.push({
          kind: "section",
          key: "s-events",
          label: t("events"),
          action: p.events.hasNextPage
            ? { label: t("seeAll"), mode: "events" }
            : undefined,
        });
        p.events.items.forEach((hit, i) =>
          out.push({ kind: "event", key: `e-${hit.id}`, hit, rank: i }),
        );
      }
      if (p.places.items.length) {
        out.push({
          kind: "section",
          key: "s-places",
          label: t("places"),
          action: p.places.hasNextPage
            ? { label: t("seeAll"), mode: "places" }
            : undefined,
        });
        p.places.items.forEach((hit, i) =>
          out.push({ kind: "place", key: `p-${hit.id}`, hit, rank: i }),
        );
      }
      if (p.organizers.items.length) {
        out.push({
          kind: "section",
          key: "s-orgs",
          label: t("organizers"),
          action: p.organizers.hasNextPage
            ? { label: t("seeAll"), mode: "organizers" }
            : undefined,
        });
        p.organizers.items.forEach((hit, i) =>
          out.push({ kind: "organizer", key: `o-${hit.id}`, hit, rank: i }),
        );
      }
      if (spotlightPosts.length) {
        out.push({
          kind: "section",
          key: "s-spotlights",
          label: t("spotlights"),
          action:
            spotlightPosts.length > 3
              ? { label: t("seeAll"), mode: "spotlights" }
              : undefined,
        });
        out.push({
          kind: "spotlights",
          key: "sp-top",
          posts: spotlightPosts.slice(0, 3),
        });
      }
      return out;
    }
    if (effectiveMode === "events") {
      return pages
        .flatMap((p) => p.events.items)
        .map((hit, i) => ({
          kind: "event" as const,
          key: `e-${hit.id}`,
          hit,
          rank: i,
        }));
    }
    if (effectiveMode === "places") {
      return pages
        .flatMap((p) => p.places.items)
        .map((hit, i) => ({
          kind: "place" as const,
          key: `p-${hit.id}`,
          hit,
          rank: i,
        }));
    }
    return pages
      .flatMap((p) => p.organizers.items)
      .map((hit, i) => ({
        kind: "organizer" as const,
        key: `o-${hit.id}`,
        hit,
        rank: i,
      }));
  }, [results.data, effectiveMode, spotlightTab, spotlightPosts, t]);

  const onEndReached = useCallback(() => {
    if (results.hasNextPage && !results.isFetchingNextPage)
      results.fetchNextPage();
  }, [results]);

  const categoryMatches = useMemo(
    () =>
      typing && !organizerQuery
        ? ALL_CATEGORY_NAMES.filter(
            (n) =>
              foldedIncludes(n, parsed.normalized) ||
              foldedIncludes(eventCategoryLabel(tc, n), parsed.normalized),
          ).slice(0, 4)
        : [],
    [typing, organizerQuery, parsed.normalized, tc],
  );

  const renderRow = ({ item }: { item: Row }) => {
    switch (item.kind) {
      case "spotlights":
        return (
          <View className="-mx-4">
            <SpotlightTileRow tiles={item.posts.map(tileFromDocument)} />
          </View>
        );
      case "section":
        return (
          <SectionHeader
            label={item.label}
            action={
              item.action
                ? {
                    label: item.action.label,
                    onPress: () => setMode(item.action?.mode ?? "all"),
                  }
                : undefined
            }
          />
        );
      case "event":
        return (
          <View
            onTouchEndCapture={() =>
              logSearchOpen(searchId, "event", item.hit.id, item.rank)
            }
          >
            <EventCard event={item.hit} />
          </View>
        );
      case "place":
        return (
          <View
            onTouchEndCapture={() =>
              logSearchOpen(searchId, "place", item.hit.id, item.rank)
            }
          >
            <PlaceCard place={item.hit} />
          </View>
        );
      case "organizer":
        return (
          <OrganizerRow
            organizer={item.hit}
            onOpen={() =>
              logSearchOpen(searchId, "organizer", item.hit.id, item.rank)
            }
            onSeeEvents={() => {
              logSearchOpen(searchId, "organizer", item.hit.id, item.rank);
              setScope({ id: item.hit.id, username: item.hit.username });
            }}
          />
        );
    }
  };

  const active = spotlightTab ? spotlight : results;
  const filtered = !spotlightTab && filterChips.length > 0;
  // Search always needs the network — there is no cached answer for a query
  // nobody has run. useQueryView still tells apart "still loading", "no
  // connection" and "the request failed" (a paused retry is not an error).
  const searchView = useQueryView<unknown>(active);
  const empty =
    searchView.kind === "loading" ? (
      <View className="gap-4 px-1 pt-2">
        {["a", "b", "c"].map((k) => (
          <EventCardSkeleton key={k} />
        ))}
      </View>
    ) : searchView.kind === "offline" ? (
      <EmptyState
        icon="cloud-offline-outline"
        title={t("youReOffline")}
        description={t("searchNeedsAConnectionItWill")}
      />
    ) : searchView.kind === "error" ? (
      <EmptyState
        icon="alert-circle-outline"
        title={t("searchDidnTLoad")}
        description={t("checkYourConnectionAndTryAgain")}
        actionLabel={t("tryAgain")}
        onAction={() => active.refetch()}
      />
    ) : spotlightTab ? (
      <EmptyState
        icon="play-circle-outline"
        title={t("noSpotlightsFor", { value: submitted ?? "" })}
        description={t("tryAnotherWordOrAHashtag")}
      />
    ) : filtered ? (
      <EmptyState
        icon="options-outline"
        title={t("nothingMatchesTheseFilters")}
        description={
          hasQuery
            ? t("noResultsForWithTheFilters", { submitted: submitted })
            : t("tryADifferentCategoryOrFewer")
        }
        actionLabel={t("clearFilters")}
        onAction={() =>
          setFilters((f) => clearSearchFiltersFor(f, effectiveMode))
        }
      />
    ) : (
      <View className="gap-4">
        <EmptyState
          icon="search-outline"
          title={
            organizerQuery ||
            parseSearchQuery(submitted ?? "").kind === "organizer"
              ? t("noOrganizersMatch", { submitted: submitted ?? "" })
              : t("noResultsFor2", { value: submitted ?? "" })
          }
          description={t("tryAShorterOrMoreGeneral")}
          actionLabel={t("exploreWhatSOn")}
          onAction={() => router.push("/(app)/(tabs)")}
        />
        <View className="flex-row flex-wrap justify-center gap-2 px-1">
          {BROWSE_CATEGORIES.slice(0, 6).map((name) => (
            <Chip
              key={name}
              label={eventCategoryLabel(tc, name)}
              onPress={() => runSearch(name)}
            />
          ))}
        </View>
      </View>
    );

  return (
    <View className="flex-1 bg-background">
      <View
        style={{ paddingTop: insets.top + 8 }}
        className="border-b border-border bg-background px-4 pb-3"
      >
        <View className="flex-row items-center gap-2">
          <View className="h-11 flex-1 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3">
            <Icon
              name={organizerQuery ? "at-outline" : "search-outline"}
              size={18}
              tone="muted"
            />
            <TextInput
              ref={inputRef}
              accessibilityLabel={t("searchEventsPlacesAndOrganizers")}
              placeholder={t("eventsPlacesOrganizersOrHandle")}
              placeholderTextColor={c["muted-foreground"]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              value={raw}
              onChangeText={(text) => {
                setRaw(text);
                if (submitted != null) setSubmitted(null);
                if (scope) setScope(null);
              }}
              onSubmitEditing={() => runSearch(raw)}
              className="flex-1 text-[15px] text-foreground"
              style={family.body ? { fontFamily: family.body } : undefined}
            />
            {raw.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("clearSearch")}
                hitSlop={10}
                onPress={clearInput}
                className="h-7 w-7 items-center justify-center rounded-full active:opacity-60"
              >
                <Icon name="close-circle" size={18} tone="muted" />
              </Pressable>
            ) : null}
          </View>
          {/* Search's own filters. Hidden for "@handle" searches and the
            Spotlights tab, which have nothing to filter. */}
          {!organizerQuery && !spotlightTab && !scope ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                activeFilterCount > 0
                  ? t("filtersActive2", {
                      activeFilterCount: activeFilterCount,
                    })
                  : t("filters")
              }
              onPress={() => {
                Keyboard.dismiss();
                setFilterOpen(true);
              }}
              className={[
                "h-11 min-w-[44px] flex-row items-center justify-center gap-1 rounded-xl border px-3 active:opacity-70",
                activeFilterCount > 0 ? "border-primary" : "border-border",
              ].join(" ")}
            >
              <Icon
                name="options-outline"
                size={18}
                tone={activeFilterCount > 0 ? "primary" : "foreground"}
              />
              {activeFilterCount > 0 ? (
                <View className="min-w-[18px] items-center rounded-full bg-primary px-1">
                  <AppText className="text-[12px] font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </AppText>
                </View>
              ) : null}
            </Pressable>
          ) : null}
        </View>
        {showResults && tabs.length > 1 && !scope ? (
          tabs.length <= 4 ? (
            <SegmentedTabs
              className="mt-3"
              options={tabs}
              value={mode}
              onChange={setMode}
            />
          ) : (
            // Five result types don't fit a segmented control on a phone
            // without truncating labels ("Organi…"); a scrolling row of
            // chips keeps every label whole.
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-4 mt-3"
              contentContainerClassName="gap-2 px-4"
              accessibilityRole="tablist"
            >
              {tabs.map((t) => (
                <Chip
                  key={t.key}
                  label={t.label}
                  selected={mode === t.key}
                  onPress={() => setMode(t.key)}
                />
              ))}
            </ScrollView>
          )
        ) : null}
        {showResults && !spotlightTab && !scope && filterChips.length > 0 ? (
          <View className="-mx-4 mt-3">
            <ActiveFilterChips
              chips={filterChips}
              onRemove={(key) =>
                setFilters((f) => clearSearchFilter(f, key as SearchFilterKey))
              }
              onClearAll={() =>
                setFilters((f) => clearSearchFiltersFor(f, effectiveMode))
              }
            />
          </View>
        ) : null}
        {scope ? (
          <View className="mt-3 flex-row items-center gap-2">
            <AppText variant="small" className="flex-1">
              {t("eventsBy", { username: scope.username })}
            </AppText>
            <Button
              title={t("backToResults")}
              size="sm"
              variant="outline"
              onPress={() => setScope(null)}
            />
          </View>
        ) : null}
      </View>

      {showResults ? (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          // While a changed filter loads, the previous list stays, dimmed.
          style={
            !spotlightTab && results.isPlaceholderData
              ? { opacity: 0.55 }
              : undefined
          }
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-4 px-4 pt-3"
          contentContainerStyle={{ paddingBottom: listPadding }}
          onEndReached={effectiveMode === "all" ? undefined : onEndReached}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={empty}
          ListFooterComponent={
            effectiveMode === "all" ? null : (
              <ListFooter
                count={rows.length}
                isFetchingNextPage={results.isFetchingNextPage}
                hasNextPage={!!results.hasNextPage}
                isError={results.isError && rows.length > 0}
                onRetry={() => results.fetchNextPage()}
              />
            )
          }
        />
      ) : typing ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="px-4 pt-1"
          contentContainerStyle={{ paddingBottom: listPadding }}
        >
          {suggest.isLoading &&
          suggest.events.length +
            suggest.places.length +
            suggest.organizers.length ===
            0 ? (
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

          {suggest.organizers.length > 0 && organizerQuery ? (
            <>
              <SectionHeader label={t("organizers")} />
              {suggest.organizers.map((s) => (
                <SuggestionRow
                  key={s.id}
                  icon="person-circle-outline"
                  title={`@${s.label}`}
                  subtitle={s.sublabel}
                  imageUri={thumb(s)}
                  verified={s.verified}
                  onPress={() => openSuggestion(s)}
                />
              ))}
            </>
          ) : null}
          {!organizerQuery && suggest.events.length > 0 ? (
            <>
              <SectionHeader label={t("events")} />
              {suggest.events.map((s) => (
                <SuggestionRow
                  key={s.id}
                  icon="calendar-outline"
                  title={s.label}
                  subtitle={
                    s.startsAt
                      ? formatDateWithSuffix(s.startsAt, undefined, locale)
                      : s.sublabel
                        ? eventCategoryLabel(tc, s.sublabel)
                        : undefined
                  }
                  imageUri={thumb(s)}
                  onPress={() => openSuggestion(s)}
                />
              ))}
            </>
          ) : null}
          {!organizerQuery && suggest.places.length > 0 ? (
            <>
              <SectionHeader label={t("places")} />
              {suggest.places.map((s) => (
                <SuggestionRow
                  key={s.id}
                  icon="storefront-outline"
                  title={s.label}
                  // The category arrives by its stored English name.
                  subtitle={
                    s.sublabel
                      ? placeCategoryLabel(tc, { name: s.sublabel })
                      : undefined
                  }
                  imageUri={thumb(s)}
                  verified={s.verified}
                  onPress={() => openSuggestion(s)}
                />
              ))}
            </>
          ) : null}
          {!organizerQuery && suggest.organizers.length > 0 ? (
            <>
              <SectionHeader label={t("organizers")} />
              {suggest.organizers.map((s) => (
                <SuggestionRow
                  key={s.id}
                  icon="person-circle-outline"
                  title={`@${s.label}`}
                  subtitle={s.sublabel}
                  imageUri={thumb(s)}
                  verified={s.verified}
                  onPress={() => openSuggestion(s)}
                />
              ))}
            </>
          ) : null}
          {categoryMatches.length > 0 ? (
            <>
              <SectionHeader label={t("categories")} />
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
          suggest.query === parsed.normalized &&
          suggest.events.length +
            suggest.places.length +
            suggest.organizers.length +
            categoryMatches.length ===
            0 ? (
            <AppText variant="muted" className="px-1 pt-3">
              {suggest.isError
                ? t("couldnTLoadSuggestions")
                : t("noQuickMatchesSearchAnyway")}
            </AppText>
          ) : null}

          <View className="mt-1 border-t border-border pt-1">
            <SuggestionRow
              icon="search-outline"
              title={
                organizerQuery
                  ? t("searchOrganizersFor", { trimmed: trimmed })
                  : t("searchFor", { trimmed: trimmed })
              }
              onPress={() => runSearch(trimmed)}
            />
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-4 pt-1"
          contentContainerStyle={{ paddingBottom: listPadding }}
        >
          {recents.length > 0 ? (
            <>
              <SectionHeader
                label={t("recent")}
                action={{ label: t("clearAll"), onPress: clear }}
              />
              {recents.map((text) => (
                <SuggestionRow
                  key={text}
                  icon={text.startsWith("@") ? "at-outline" : "time-outline"}
                  title={text}
                  onPress={() => runSearch(text)}
                  onRemove={() => remove(text)}
                />
              ))}
            </>
          ) : null}
          <SectionHeader label={t("browseCategories")} />
          <View className="flex-row flex-wrap gap-2 px-1 pt-1">
            {BROWSE_CATEGORIES.map((name) => (
              <Chip
                key={name}
                label={eventCategoryLabel(tc, name)}
                onPress={() => runSearch(name)}
              />
            ))}
          </View>
          {program.organizerSearch ? (
            <AppText variant="caption" tone="muted" className="px-1 pt-4">
              {t("tipTypeAndANameTo")}
            </AppText>
          ) : null}
        </ScrollView>
      )}

      <SearchFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        mode={showResults ? effectiveMode : "all"}
        filters={filters}
        onApply={(next) => {
          setFilters(next);
          // Applying filters with text in the box runs that search; the
          // query itself is never changed by filtering.
          if (trimmed && submitted !== trimmed) runSearch(trimmed);
        }}
        locationLabel={hasRealLocation ? (area?.label ?? null) : null}
        hasLocation={hasRealLocation}
      />
    </View>
  );
}
