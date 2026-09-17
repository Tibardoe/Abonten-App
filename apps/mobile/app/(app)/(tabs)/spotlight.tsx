import { useSession } from "@/auth/SessionProvider";
import { MediaStatusBar } from "@/components/app/MediaStatusBar";
import { SpotlightCard } from "@/components/content/SpotlightCard";
import { useCoarseLocation } from "@/features/content/useCoarseLocation";
import { flattenFeed, useContentFeed } from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { flushContentViews } from "@/features/content/useContentTelemetry";
import { useVolumeKeys } from "@/features/content/useVolumeKeys";
import { useDeviceLocation } from "@/features/discovery/useDeviceLocation";
import { FEED_SURFACES, FEED_SURFACE_LABEL } from "@abonten/core/content/copy";
import type {
  ContentFeedItem,
  ContentFeedSurface,
  ContentProgram,
} from "@abonten/types/contentType";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

// Spotlight: the vertical feed, a bottom tab. One video player for the whole
// screen, handed to whichever page is on screen; everything else is a
// poster. Playback stops when the tab loses focus or the app backgrounds.
//
// Page changes: the player is told to load the new page's video, and only
// once that load has finished does the page show the player (`loadedPostId`)
// — until then it shows its own poster. See SpotlightCard for why.
export default function SpotlightFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const isFocused = useIsFocused();
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

  const feed = useContentFeed(
    surface,
    coords,
    ready &&
      program.spotlight &&
      !needsSignIn &&
      (needsLocation ? !!coords : coarse.done),
  );
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const items = flattenFeed(feed.data?.pages).filter(
    (i) => !hidden.has(i.post.id),
  );

  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadedPostId, setLoadedPostId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const [held, setHeld] = useState(false);
  const active = items[activeIndex];

  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 0.5;
  });

  useEffect(() => {
    try {
      player.muted = muted;
    } catch {}
  }, [muted, player]);

  // Load the active page's video (or stop playback for a photo).
  const activeMedia = active?.post.media[0];
  const activeUri =
    activeMedia?.type === "video"
      ? activeMedia.playbackStatus === "ready" && activeMedia.playbackUrl
        ? activeMedia.playbackUrl
        : activeMedia.mediaUrl
      : null;
  const fallbackUri = activeMedia?.mediaUrl ?? null;
  const loadSeq = useRef(0);
  // Reload only when the source changes; focus and holds are applied by the
  // effect below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the source
  useEffect(() => {
    const seq = ++loadSeq.current;
    const postId = active?.post.id ?? null;
    setLoadedPostId(null);
    try {
      player.pause();
    } catch {}
    if (!activeUri) return;
    (async () => {
      try {
        await player.replaceAsync({ uri: activeUri });
        if (seq !== loadSeq.current) return;
        setLoadedPostId(postId);
        if (isFocused && !held) player.play();
      } catch {
        if (
          seq !== loadSeq.current ||
          !fallbackUri ||
          fallbackUri === activeUri
        )
          return;
        try {
          await player.replaceAsync({ uri: fallbackUri });
          if (seq !== loadSeq.current) return;
          setLoadedPostId(postId);
          if (isFocused && !held) player.play();
        } catch {}
      }
    })();
  }, [activeUri, player]);

  // Warm the next posters so a swipe lands on a picture, not black.
  useEffect(() => {
    const next = items
      .slice(activeIndex + 1, activeIndex + 3)
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
    if (!activeUri) return;
    try {
      if (isFocused && !held) player.play();
      else player.pause();
    } catch {}
  }, [isFocused, held, activeUri, player]);

  useEffect(() => {
    if (!isFocused) void flushContentViews();
  }, [isFocused]);

  const onViewable = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<ContentFeedItem>[] }) => {
      const first = viewableItems.find((v) => v.isViewable);
      if (first?.index != null) setActiveIndex(first.index);
    },
  ).current;

  useEffect(() => {
    if (
      items.length > 0 &&
      activeIndex >= items.length - 3 &&
      feed.hasNextPage &&
      !feed.isFetchingNextPage
    ) {
      feed.fetchNextPage();
    }
  }, [activeIndex, items.length, feed]);

  const onCommentsOpenChange = useCallback(
    (open: boolean) => setCommentsOpen(open),
    [],
  );

  const onHide = useCallback(
    (postId: string) => setHidden((prev) => new Set(prev).add(postId)),
    [],
  );
  const toggleMute = useCallback(() => setMuted((m) => !m), []);
  useVolumeKeys(isFocused, muted, setMuted);

  const selectSurface = (s: ContentFeedSurface) => {
    setSurface(s);
    setActiveIndex(0);
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
  } else if (feed.isError) {
    empty = {
      title: "Couldn't load Spotlight",
      body: "Check your connection and try again.",
      label: "Retry",
      action: () => feed.refetch(),
    };
  } else if (feed.isFetched && items.length === 0) {
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
    (!empty && (feed.isLoading || (needsLocation ? locating : !coarse.done)));

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
          key={surface}
          data={items}
          keyExtractor={(i) => i.post.id}
          renderItem={({ item, index }) => (
            <SpotlightCard
              item={item}
              active={index === activeIndex && isFocused}
              videoReady={loadedPostId === item.post.id}
              height={height}
              player={player}
              muted={muted}
              onToggleMute={toggleMute}
              surface={surface}
              onHide={onHide}
              holdPlayback={setHeld}
              topInset={topInset}
              bottomInset={16}
              bottomObstruction={bottomObstruction}
              onCommentsOpenChange={onCommentsOpenChange}
            />
          )}
          extraData={loadedPostId}
          scrollEnabled={!commentsOpen}
          // The comments composer lives inside a page: without this the
          // first tap on Send only closes the keyboard.
          keyboardShouldPersistTaps="handled"
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={height}
          getItemLayout={(_, index) => ({
            length: height,
            offset: height * index,
            index,
          })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          removeClippedSubviews
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
