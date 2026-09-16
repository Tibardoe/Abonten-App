import { useSession } from "@/auth/SessionProvider";
import { SpotlightCard } from "@/components/content/SpotlightCard";
import { useCoarseLocation } from "@/features/content/useCoarseLocation";
import { flattenFeed, useContentFeed } from "@/features/content/useContent";
import { useContentProgram } from "@/features/content/useContentProgram";
import { flushContentViews } from "@/features/content/useContentTelemetry";
import { useDeviceLocation } from "@/features/discovery/useDeviceLocation";
import { FEED_SURFACES, FEED_SURFACE_LABEL } from "@abonten/core/content/copy";
import type {
  ContentFeedItem,
  ContentFeedSurface,
  ContentProgram,
} from "@abonten/types/contentType";
import { AppText, Button, Icon } from "@abonten/ui-native";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StatusBar,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function surfaceAvailable(s: ContentFeedSurface, p: ContentProgram) {
  if (s === "nearby") return p.nearby;
  if (s === "trending") return p.trending;
  if (s === "happening_soon") return p.happeningSoon;
  return true;
}

// Spotlight: a full-screen vertical feed. One video player for the whole
// screen, handed to whichever page is on screen; everything else is a
// poster. Playback stops when the screen loses focus or the app backgrounds.
export default function SpotlightFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    try {
      player.pause();
    } catch {}
    if (!activeUri) return;
    (async () => {
      try {
        await player.replaceAsync({ uri: activeUri });
        if (seq !== loadSeq.current) return;
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
          if (seq === loadSeq.current && isFocused && !held) player.play();
        } catch {}
      }
    })();
  }, [activeUri, player]);

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

  const onHide = useCallback(
    (postId: string) => setHidden((prev) => new Set(prev).add(postId)),
    [],
  );
  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  const selectSurface = (s: ContentFeedSurface) => {
    setSurface(s);
    setActiveIndex(0);
  };

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
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <StatusBar barStyle="light-content" />
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
              height={height}
              player={player}
              muted={muted}
              onToggleMute={toggleMute}
              surface={surface}
              onHide={onHide}
              holdPlayback={setHeld}
            />
          )}
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

      {/* Header: back, tabs, create */}
      <View
        style={{ position: "absolute", top: insets.top + 4, left: 0, right: 0 }}
        className="flex-row items-center gap-1 pl-2 pr-3"
      >
        <Pressable
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(app)/(tabs)")
          }
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-10 w-10 items-center justify-center"
        >
          <Icon name="arrow-back" size={24} color="#fff" />
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-1.5 pr-2"
          className="flex-1"
        >
          {surfaces.map((s) => (
            <Pressable
              key={s}
              onPress={() => selectSurface(s)}
              accessibilityRole="tab"
              accessibilityState={{ selected: surface === s }}
              className={[
                "rounded-full px-3 py-1.5",
                surface === s ? "bg-white" : "bg-black/40",
              ].join(" ")}
            >
              <AppText
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
      </View>
    </View>
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
