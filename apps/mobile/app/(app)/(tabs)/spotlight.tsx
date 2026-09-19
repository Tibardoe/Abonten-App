import { useSession } from "@/auth/SessionProvider";
import { MediaStatusBar } from "@/components/app/MediaStatusBar";
import { SpotlightCard } from "@/components/content/SpotlightCard";
import {
  setSpotlightMuted,
  useSpotlightMuted,
} from "@/features/content/playback/spotlightSound";
import { useCoarseLocation } from "@/features/content/useCoarseLocation";
import {
  contentFeedKey,
  flattenFeed,
  useContentFeed,
  useRefreshContentFeed,
} from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { flushContentViews } from "@/features/content/useContentTelemetry";
import { useVolumeKeys } from "@/features/content/useVolumeKeys";
import { useDeviceLocation } from "@/features/discovery/useDeviceLocation";
import { useIsOnline } from "@/lib/network";
import { FEED_SURFACES, FEED_SURFACE_LABEL } from "@abonten/core/content/copy";
import {
  feedPlaybackMode,
  reconcileActiveIndex,
} from "@abonten/core/content/feedPlayback";
import type {
  ContentFeedItem,
  ContentFeedSurface,
  ContentProgram,
} from "@abonten/types/contentType";
import { AppText, Button, Icon, Refresher, useToast } from "@abonten/ui-native";
import { Image } from "expo-image";
import {
  useIsFocused,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  Pressable,
  ScrollView,
  View,
  type ViewToken,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

function surfaceAvailable(s: ContentFeedSurface, p: ContentProgram) {
  if (s === "nearby") return p.nearby;
  if (s === "trending") return p.trending;
  if (s === "happening_soon") return p.happeningSoon;
  return true;
}

/** A cache restored from disk older than this is refreshed on open. */
const RESTORED_FEED_MAX_AGE_MS = 10 * 60 * 1000;

// Spotlight: the vertical feed, a bottom tab.
//
// Media: each page owns its own player while it is the active page or a
// direct neighbour (SpotlightVideo + @abonten/core/content/feedPlayback);
// this screen only decides WHICH page is active. The active page is tracked
// by post id, not by index, so a refresh or a hidden post never hands
// playback to the wrong video.
//
// Refresh: re-pressing the Spotlight tab scrolls back to the first video, or
// — already there — loads a fresh feed; pulling down at the top does the
// same. Nothing else re-orders the feed while someone is watching it (see
// useContentFeed).
export default function SpotlightFeedScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const isFocused = useIsFocused();
  const online = useIsOnline();
  const toast = useToast();
  const { session } = useSession();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { program, ready } = useContentProgram();

  const initial = (FEED_SURFACES as readonly string[]).includes(
    params.tab ?? "",
  )
    ? (params.tab as ContentFeedSurface)
    : "for_you";
  const [surface, setSurface] = useState<ContentFeedSurface>(initial);
  const surfaces = useMemo(
    () => FEED_SURFACES.filter((s) => surfaceAvailable(s, program)),
    [program],
  );

  // Location is asked for only when the Nearby tab is opened.
  const needsLocation = surface === "nearby";
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    isFallback: boolean;
  } | null>(null);
  const locating = needsLocation && location === null;
  // Other tabs use a rough position only if location is already allowed,
  // so a promotion aimed at an area can reach people there.
  const coarse = useCoarseLocation(!needsLocation);
  const coords = needsLocation
    ? location && !location.isFallback
      ? { lat: location.lat, lng: location.lng }
      : null
    : coarse.coords;
  const needsSignIn = surface === "following" && !session;

  const feedEnabled =
    ready &&
    program.spotlight &&
    !needsSignIn &&
    (needsLocation ? !!coords : coarse.done);
  const feed = useContentFeed(surface, coords, feedEnabled);
  const feedKey = contentFeedKey(session?.user.id ?? null, surface, coords);
  const refreshFeed = useRefreshContentFeed();

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const items = useMemo(
    () => flattenFeed(feed.data?.pages).filter((i) => !hidden.has(i.post.id)),
    [feed.data, hidden],
  );
  const ids = useMemo(() => items.map((i) => i.post.id), [items]);

  const [height, setHeight] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const muted = useSpotlightMuted();

  // ── Which page is active ──────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const lastIndex = useRef(0);
  const activeIndex = reconcileActiveIndex(ids, activeId, lastIndex.current);
  lastIndex.current = Math.max(0, activeIndex);
  const listRef = useRef<FlatList<ContentFeedItem>>(null);

  // A page becomes active once it is (nearly) settled on screen. At 80%
  // visibility a paged list is already committed to snapping onto it, so a
  // half-swipe that springs back never starts and stops another video.
  const onViewable = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<ContentFeedItem>[] }) => {
      const first = viewableItems.find((v) => v.isViewable);
      if (first?.item) setActiveId(first.item.post.id);
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  // Warm the posters a little further ahead than the preloaded players, so
  // even a fast fling lands on a picture.
  useEffect(() => {
    const next = items
      .slice(activeIndex + 2, activeIndex + 5)
      .map((i) => {
        const m = i.post.media[0];
        return m?.type === "video"
          ? (m.posterUrl ?? m.thumbnailUrl)
          : m?.mediaUrl;
      })
      .filter((u): u is string => !!u);
    if (next.length) void Image.prefetch(next, "memory-disk");
  }, [activeIndex, items]);

  useEffect(() => {
    if (!isFocused) void flushContentViews();
  }, [isFocused]);

  useEffect(() => {
    if (
      items.length > 0 &&
      activeIndex >= items.length - 3 &&
      feed.hasNextPage &&
      !feed.isFetchingNextPage &&
      !feed.isFetchNextPageError
    ) {
      feed.fetchNextPage();
    }
  }, [activeIndex, items.length, feed]);

  // ── Refresh ───────────────────────────────────────────────────────
  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (!feedEnabled || refreshing.current) return;
    refreshing.current = true;
    try {
      await refreshFeed(feedKey);
      setActiveId(null);
      lastIndex.current = 0;
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    } catch {
      toast.error(
        online
          ? "Couldn't refresh Spotlight. Try again."
          : "You're offline. Showing what was already loaded.",
      );
    } finally {
      refreshing.current = false;
    }
  }, [feedEnabled, refreshFeed, feedKey, toast, online]);

  // Re-pressing the tab: back to the first video, or refresh when already
  // there. `navigation.isFocused()` is read at press time, before the tab
  // switch, so a press that merely opens Spotlight does nothing extra.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress" as never, () => {
      if (!navigation.isFocused()) return;
      if (activeIndexRef.current > 0) {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      } else {
        void refreshRef.current();
      }
    });
    return unsubscribe;
  }, [navigation]);

  // A cache restored from a previous session is shown at once, then
  // replaced with a fresh feed if it is old — before anyone has scrolled.
  const checkedRestore = useRef<string | null>(null);
  useEffect(() => {
    const token = JSON.stringify(feedKey);
    if (!feedEnabled || !online || checkedRestore.current === token) return;
    if (!feed.data) return;
    checkedRestore.current = token;
    if (
      activeIndex <= 0 &&
      Date.now() - feed.dataUpdatedAt > RESTORED_FEED_MAX_AGE_MS
    ) {
      void refresh();
    }
  }, [
    feedEnabled,
    online,
    feed.data,
    feed.dataUpdatedAt,
    feedKey,
    activeIndex,
    refresh,
  ]);

  // Back online: load what failed while offline (the whole feed if nothing
  // was shown, otherwise the next page) — on the reconnect itself, not on a
  // timer. Only the transition triggers it, so a failure while online is
  // left to the Retry button instead of retrying in a loop.
  const wasOnline = useRef(online);
  useEffect(() => {
    const reconnected = online && !wasOnline.current;
    wasOnline.current = online;
    if (!reconnected || !feedEnabled) return;
    if (feed.isError && items.length === 0) void feed.refetch();
    else if (feed.isFetchNextPageError) void feed.fetchNextPage();
  }, [online, feedEnabled, feed, items.length]);

  const onCommentsOpenChange = useCallback(
    (open: boolean) => setCommentsOpen(open),
    [],
  );

  const onHide = useCallback(
    (postId: string) => setHidden((prev) => new Set(prev).add(postId)),
    [],
  );
  useVolumeKeys(isFocused, muted, setSpotlightMuted);

  const selectSurface = (s: ContentFeedSurface) => {
    setSurface(s);
    setActiveId(null);
    lastIndex.current = 0;
  };

  // The header row (tabs + create) and what the cards must keep clear of.
  const headerTop = insets.top + 4;
  const topInset = headerTop + 44;
  // The scene ends at the tab bar; the keyboard rises from the screen edge.
  const bottomObstruction =
    height > 0 ? Math.max(0, window.height - height) : 0;

  // The tab row scrolls sideways on narrow phones: keep the selected tab in
  // view (centred where possible) and fade an edge while tabs are hidden
  // past it, instead of cutting a label in half against a button.
  const tabsRef = useRef<ScrollView>(null);
  const tabFrames = useRef<
    Partial<Record<ContentFeedSurface, { x: number; width: number }>>
  >({});
  const tabsWidth = useRef(0);
  const tabsContentWidth = useRef(0);
  const tabsScrollX = useRef(0);
  const [tabsFade, setTabsFade] = useState({ start: false, end: false });
  const updateTabsFade = useCallback(() => {
    const overflow = tabsContentWidth.current > tabsWidth.current + 1;
    const start = overflow && tabsScrollX.current > 4;
    const end =
      overflow &&
      tabsScrollX.current + tabsWidth.current < tabsContentWidth.current - 4;
    setTabsFade((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );
  }, []);
  useEffect(() => {
    const frame = tabFrames.current[surface];
    if (!frame || tabsWidth.current === 0) return;
    const x = Math.max(0, frame.x - (tabsWidth.current - frame.width) / 2);
    tabsRef.current?.scrollTo({ x, animated: true });
  }, [surface]);

  let empty: {
    title: string;
    body: string;
    action?: () => void;
    label?: string;
  } | null = null;
  if (ready && !program.spotlight) {
    empty = {
      title: "Spotlight isn't available yet",
      body: "We're rolling it out gradually. Check back soon.",
    };
  } else if (needsSignIn) {
    empty = {
      title: "Follow organizers and places",
      body: "Sign in to see Spotlights from the people you follow.",
      label: "Sign in",
      action: () => router.push("/(auth)/sign-in"),
    };
  } else if (needsLocation && !locating && !coords) {
    empty = {
      title: "Location is off",
      body: "Allow location access to see Spotlights near you.",
    };
  } else if (items.length > 0) {
    // Whatever is loaded (or restored from the last session) stays on
    // screen; a failed refresh never replaces it with an error.
  } else if (!online && !feed.isFetching) {
    empty = {
      title: "You're offline",
      body: "Spotlight will load as soon as you're back online.",
    };
  } else if (feed.isError) {
    empty = {
      title: "Couldn't load Spotlight",
      body: "Check your connection and try again.",
      label: "Retry",
      action: () => feed.refetch(),
    };
  } else if (feed.isFetched && !feed.isFetching) {
    empty = {
      title: "Nothing here yet",
      body:
        surface === "following"
          ? "Follow organizers and places to fill this tab."
          : "New Spotlights will show up here.",
    };
  }

  const loading =
    !ready ||
    (!empty &&
      items.length === 0 &&
      (feed.isLoading ||
        feed.isFetching ||
        (needsLocation ? locating : !coarse.done)));

  // Only the pages around the active one get a player; while another
  // screen is on top, only the active page keeps one (paused), so coming
  // back is instant without holding three decoders in the background.
  const renderItem = useCallback<ListRenderItem<ContentFeedItem>>(
    ({ item, index }) => (
      <SpotlightCard
        item={item}
        mode={feedPlaybackMode(
          index,
          activeIndex,
          isFocused ? undefined : { ahead: 0, behind: 0 },
        )}
        screenFocused={isFocused}
        height={height}
        surface={surface}
        onHide={onHide}
        topInset={topInset}
        bottomInset={16}
        bottomObstruction={bottomObstruction}
        onCommentsOpenChange={onCommentsOpenChange}
      />
    ),
    [
      activeIndex,
      isFocused,
      height,
      surface,
      onHide,
      topInset,
      bottomObstruction,
      onCommentsOpenChange,
    ],
  );

  return (
    <View
      className="flex-1 bg-black"
      onLayout={(e) => {
        // Never re-page the feed under an open comments panel.
        if (!commentsOpen) setHeight(e.nativeEvent.layout.height);
      }}
    >
      <MediaStatusBar />
      {needsLocation && location === null ? (
        <LocationProbe onResult={setLocation} />
      ) : null}

      {height > 0 && !empty && !loading ? (
        <FlatList
          ref={listRef}
          key={surface}
          data={items}
          keyExtractor={(i) => i.post.id}
          renderItem={renderItem}
          extraData={activeIndex}
          scrollEnabled={!commentsOpen}
          // The comments composer lives inside a page: without this the
          // first tap on Send only closes the keyboard.
          keyboardShouldPersistTaps="handled"
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({
            length: height,
            offset: height * index,
            index,
          })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewabilityConfig}
          // Two pages each side stay mounted so a preloaded neighbour is
          // always a mounted view. Clipped-subview removal stays OFF: on
          // Android it detaches off-screen views, which destroys a video's
          // TextureView and left re-attached pages on a frozen frame.
          windowSize={5}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews={false}
          refreshControl={
            <Refresher
              onRefresh={refresh}
              tintColor="#fff"
              colors={["#0F9D8F"]}
              progressViewOffset={topInset}
              enabled={!commentsOpen}
            />
          }
          ListFooterComponent={
            feed.isFetchingNextPage ? (
              <View className="h-16 items-center justify-center">
                <ActivityIndicator color="#fff" />
              </View>
            ) : null
          }
        />
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#fff" />
        </View>
      ) : empty ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <AppText className="text-center text-[18px] font-semibold text-white">
            {empty.title}
          </AppText>
          <AppText className="text-center text-white/70">{empty.body}</AppText>
          {empty.action && empty.label ? (
            <Button title={empty.label} onPress={empty.action} />
          ) : null}
        </View>
      ) : null}

      {/* Header: feed tabs, create. Hidden while comments are open. */}
      {commentsOpen ? null : (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={{ position: "absolute", top: headerTop, left: 0, right: 0 }}
          className="flex-row items-center gap-1 pl-1 pr-3"
        >
          <View className="flex-1">
            <ScrollView
              ref={tabsRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-1.5 px-2"
              scrollEventThrottle={32}
              onLayout={(e) => {
                tabsWidth.current = e.nativeEvent.layout.width;
                updateTabsFade();
              }}
              onContentSizeChange={(w) => {
                tabsContentWidth.current = w;
                updateTabsFade();
              }}
              onScroll={(e) => {
                tabsScrollX.current = e.nativeEvent.contentOffset.x;
                updateTabsFade();
              }}
            >
              {surfaces.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => selectSurface(s)}
                  onLayout={(e) => {
                    tabFrames.current[s] = {
                      x: e.nativeEvent.layout.x,
                      width: e.nativeEvent.layout.width,
                    };
                  }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: surface === s }}
                  className={[
                    "rounded-full px-3 py-1.5",
                    surface === s ? "bg-white" : "bg-black/40",
                  ].join(" ")}
                >
                  <AppText
                    numberOfLines={1}
                    className={[
                      "text-[13px] font-semibold",
                      surface === s ? "text-black" : "text-white",
                    ].join(" ")}
                  >
                    {FEED_SURFACE_LABEL[s]}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
            {tabsFade.start ? <TabsEdgeFade side="start" /> : null}
            {tabsFade.end ? <TabsEdgeFade side="end" /> : null}
          </View>
          {program.canPublish && program.spotlightPosting ? (
            <Pressable
              onPress={() => router.push("/(app)/spotlight/new?kind=spotlight")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Create a Spotlight"
              className="h-10 w-10 items-center justify-center"
            >
              <Icon name="add-circle-outline" size={26} color="#fff" />
            </Pressable>
          ) : null}
        </Animated.View>
      )}
    </View>
  );
}

function TabsEdgeFade({ side }: { side: "start" | "end" }) {
  const id = `tabs-fade-${side}`;
  return (
    <Svg
      pointerEvents="none"
      width={44}
      height="100%"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        ...(side === "start" ? { left: 0 } : { right: 0 }),
      }}
    >
      <Defs>
        <LinearGradient
          id={id}
          x1={side === "start" ? "1" : "0"}
          y1="0"
          x2={side === "start" ? "0" : "1"}
          y2="0"
        >
          <Stop offset="0" stopColor="#000" stopOpacity="0" />
          <Stop offset="1" stopColor="#000" stopOpacity="0.85" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

function LocationProbe({
  onResult,
}: {
  onResult: (l: { lat: number; lng: number; isFallback: boolean }) => void;
}) {
  const { location } = useDeviceLocation();
  useEffect(() => {
    if (location) onResult(location);
  }, [location, onResult]);
  return null;
}
