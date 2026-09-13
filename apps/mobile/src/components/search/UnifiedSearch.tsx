import { EventCard, EventCardSkeleton } from "@/components/EventCard";
import { PlaceCard } from "@/components/PlaceCard";
import { useDiscoveryProgram } from "@/features/discovery/useDiscoveryProgram";
import { useRecentSearches } from "@/features/search/recentSearches";
import {
  logSearchOpen,
  useUnifiedResults,
  useUnifiedSuggestions,
} from "@/features/search/useUnifiedSearch";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { eventCategoriesAndTypes } from "@abonten/core/eventCategoriesAndTypes";
import {
  isSearchableQuery,
  parseSearchQuery,
} from "@abonten/core/search/parseSearchQuery";
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
import { OrganizerRow } from "./OrganizerRow";

// The unified Search tab (Discovery): one box for events, places and
// organizers, "@handle" for organizers only. Idle shows recent searches and
// categories; typing shows grouped suggestions; submitting shows ranked
// results with All / Events / Places / Organizers tabs. The legacy
// events-only screen is still used while the programme is off.

const BROWSE_CATEGORIES = eventCategoriesAndTypes
  .map((c) => c.category)
  .slice(0, 8);
const ALL_CATEGORY_NAMES = eventCategoriesAndTypes.map((c) => c.category);

type Row =
  | {
      kind: "section";
      key: string;
      label: string;
      action?: { label: string; mode: SearchMode };
    }
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const c = useThemeColors();
  const inputRef = useRef<TextInput>(null);
  const { program } = useDiscoveryProgram();

  const [raw, setRaw] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [mode, setMode] = useState<SearchMode>("all");
  const [scope, setScope] = useState<{ id: string; username: string } | null>(
    null,
  );
  const { recents, add, remove, clear } = useRecentSearches();

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
  const showResults =
    (submitted != null && submitted === trimmed) || scope != null;
  const effectiveMode: SearchMode = scope ? "events" : mode;

  const results = useUnifiedResults({
    q: scope ? "" : (submitted ?? ""),
    mode: effectiveMode,
    organizerId: scope?.id,
    enabled: showResults,
  });

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
    const all: { key: SearchMode; label: string }[] = [
      { key: "all", label: "All" },
      { key: "events", label: "Events" },
      ...(program.placeSearch
        ? [{ key: "places" as const, label: "Places" }]
        : []),
      ...(program.organizerSearch
        ? [{ key: "organizers" as const, label: "People" }]
        : []),
    ];
    return parseSearchQuery(submitted ?? "").kind === "organizer"
      ? all.filter((t) => t.key === "organizers")
      : all;
  }, [program.placeSearch, program.organizerSearch, submitted]);

  const rows: Row[] = useMemo(() => {
    const pages = results.data?.pages ?? [];
    if (pages.length === 0) return [];
    if (effectiveMode === "all") {
      const p = pages[0];
      const out: Row[] = [];
      if (p.events.items.length) {
        out.push({
          kind: "section",
          key: "s-events",
          label: "Events",
          action: p.events.hasNextPage
            ? { label: "See all", mode: "events" }
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
          label: "Places",
          action: p.places.hasNextPage
            ? { label: "See all", mode: "places" }
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
          label: "Organizers",
          action: p.organizers.hasNextPage
            ? { label: "See all", mode: "organizers" }
            : undefined,
        });
        p.organizers.items.forEach((hit, i) =>
          out.push({ kind: "organizer", key: `o-${hit.id}`, hit, rank: i }),
        );
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
  }, [results.data, effectiveMode]);

  const onEndReached = useCallback(() => {
    if (results.hasNextPage && !results.isFetchingNextPage)
      results.fetchNextPage();
  }, [results]);

  const categoryMatches = useMemo(
    () =>
      typing && !organizerQuery
        ? ALL_CATEGORY_NAMES.filter((n) =>
            n.toLowerCase().includes(parsed.normalized),
          ).slice(0, 4)
        : [],
    [typing, organizerQuery, parsed.normalized],
  );

  const renderRow = ({ item }: { item: Row }) => {
    switch (item.kind) {
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

  const empty = results.isLoading ? (
    <View className="gap-4 px-1 pt-2">
      {["a", "b", "c"].map((k) => (
        <EventCardSkeleton key={k} />
      ))}
    </View>
  ) : results.isError ? (
    <EmptyState
      icon="cloud-offline-outline"
      title="Search didn't load"
      description="Check your connection and try again."
      actionLabel="Try again"
      onAction={() => results.refetch()}
    />
  ) : (
    <View className="gap-4">
      <EmptyState
        icon="search-outline"
        title={
          organizerQuery ||
          parseSearchQuery(submitted ?? "").kind === "organizer"
            ? `No organizers match ${submitted}`
            : `No results for “${submitted ?? ""}”`
        }
        description="Try a shorter or more general term, or check the spelling."
        actionLabel="Explore what's on"
        onAction={() => router.push("/(app)/(tabs)")}
      />
      <View className="flex-row flex-wrap justify-center gap-2 px-1">
        {BROWSE_CATEGORIES.slice(0, 6).map((name) => (
          <Chip key={name} label={name} onPress={() => runSearch(name)} />
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
        <View className="h-11 flex-row items-center gap-2 rounded-xl border border-input bg-card px-3">
          <Icon
            name={organizerQuery ? "at-outline" : "search-outline"}
            size={18}
            tone="muted"
          />
          <TextInput
            ref={inputRef}
            accessibilityLabel="Search events, places and organizers"
            placeholder="Events, places, organizers or @handle"
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
              accessibilityLabel="Clear search"
              hitSlop={10}
              onPress={clearInput}
              className="h-7 w-7 items-center justify-center rounded-full active:opacity-60"
            >
              <Icon name="close-circle" size={18} tone="muted" />
            </Pressable>
          ) : null}
        </View>
        {showResults && tabs.length > 1 && !scope ? (
          <SegmentedTabs
            className="mt-3"
            options={tabs}
            value={mode}
            onChange={setMode}
          />
        ) : null}
        {scope ? (
          <View className="mt-3 flex-row items-center gap-2">
            <AppText variant="small" className="flex-1">
              Events by @{scope.username}
            </AppText>
            <Button
              title="Back to results"
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
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-4 px-4 pb-16 pt-3"
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
          contentContainerClassName="px-4 pb-16 pt-1"
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
              <SectionHeader label="Organizers" />
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
              <SectionHeader label="Events" />
              {suggest.events.map((s) => (
                <SuggestionRow
                  key={s.id}
                  icon="calendar-outline"
                  title={s.label}
                  subtitle={
                    s.startsAt ? formatDateWithSuffix(s.startsAt) : s.sublabel
                  }
                  imageUri={thumb(s)}
                  onPress={() => openSuggestion(s)}
                />
              ))}
            </>
          ) : null}
          {!organizerQuery && suggest.places.length > 0 ? (
            <>
              <SectionHeader label="Places" />
              {suggest.places.map((s) => (
                <SuggestionRow
                  key={s.id}
                  icon="storefront-outline"
                  title={s.label}
                  subtitle={s.sublabel}
                  imageUri={thumb(s)}
                  verified={s.verified}
                  onPress={() => openSuggestion(s)}
                />
              ))}
            </>
          ) : null}
          {!organizerQuery && suggest.organizers.length > 0 ? (
            <>
              <SectionHeader label="Organizers" />
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
          suggest.query === parsed.normalized &&
          suggest.events.length +
            suggest.places.length +
            suggest.organizers.length +
            categoryMatches.length ===
            0 ? (
            <AppText variant="muted" className="px-1 pt-3">
              {suggest.isError
                ? "Couldn't load suggestions."
                : "No quick matches. Search anyway."}
            </AppText>
          ) : null}

          <View className="mt-1 border-t border-border pt-1">
            <SuggestionRow
              icon="search-outline"
              title={
                organizerQuery
                  ? `Search organizers for “${trimmed}”`
                  : `Search for “${trimmed}”`
              }
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
                  icon={text.startsWith("@") ? "at-outline" : "time-outline"}
                  title={text}
                  onPress={() => runSearch(text)}
                  onRemove={() => remove(text)}
                />
              ))}
            </>
          ) : null}
          <SectionHeader label="Browse categories" />
          <View className="flex-row flex-wrap gap-2 px-1 pt-1">
            {BROWSE_CATEGORIES.map((name) => (
              <Chip key={name} label={name} onPress={() => runSearch(name)} />
            ))}
          </View>
          {program.organizerSearch ? (
            <AppText variant="caption" tone="muted" className="px-1 pt-4">
              Tip: type @ and a name to find an organizer.
            </AppText>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
