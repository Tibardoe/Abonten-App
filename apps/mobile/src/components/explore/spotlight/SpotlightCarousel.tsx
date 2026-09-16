import { hapticSelection } from "@/lib/haptics";
import { Icon } from "@abonten/ui-native";
import { useIsFocused } from "expo-router";
import {
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AppState,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// The paging + rotation half of the Explore Spotlight (the slide cards are
// in SpotlightCards.tsx, the slide list comes from
// @abonten/core/discovery/spotlight).
//
// • Paging is native: a horizontal FlatList with `pagingEnabled`, one page
//   per window width, so swiping feels like every other pager on the
//   platform and costs no JS per frame. Only the visible page and its
//   neighbours are rendered.
// • Rotation is ONE UI-thread animation of the active segment's fill; its
//   completion advances the page. No JS interval ticking in the background.
// • Rotation stops while a finger is on the carousel, while the screen is not
//   in front, while the app is in the background, when the person pauses it
//   (a visible control — auto-moving content must be pausable), and never
//   runs with the OS "reduce motion" setting.

const SLIDE_MS = 6000;
const H_PADDING = 16;

export function SpotlightCarousel<T extends { key: string }>({
  slides,
  height,
  renderSlide,
  onSlideVisible,
}: {
  slides: T[];
  height: number;
  renderSlide: (
    slide: T,
    info: { index: number; count: number; width: number },
  ) => ReactElement;
  /** Fired when a slide becomes the one on show (analytics / impressions). */
  onSlideVisible?: (slide: T, index: number) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = width - H_PADDING * 2;
  const count = slides.length;
  const rotating = count > 1;

  const listRef = useRef<FlatList<T>>(null);
  const reduceMotion = useReducedMotion();
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const [touching, setTouching] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active"),
    );
    return () => sub.remove();
  }, []);

  // A shorter list (a featured listing expired, the tab changed) must never
  // leave the pager pointing past its end.
  useEffect(() => {
    if (indexRef.current < count) return;
    indexRef.current = 0;
    setIndex(0);
    progress.value = 0;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [count, progress]);

  const onVisibleRef = useRef(onSlideVisible);
  onVisibleRef.current = onSlideVisible;
  const current = slides[index];
  useEffect(() => {
    if (current) onVisibleRef.current?.(current, index);
  }, [current, index]);

  const settleOn = useCallback(
    (next: number) => {
      if (next === indexRef.current) return;
      indexRef.current = next;
      cancelAnimation(progress);
      progress.value = 0;
      setIndex(next);
    },
    [progress],
  );

  const goTo = useCallback(
    (next: number, fromUser: boolean) => {
      if (count === 0) return;
      const target = ((next % count) + count) % count;
      if (fromUser) hapticSelection();
      listRef.current?.scrollToOffset({
        offset: target * width,
        animated: !reduceMotion,
      });
      settleOn(target);
    },
    [count, width, reduceMotion, settleOn],
  );

  const advance = useCallback(() => goTo(indexRef.current + 1, false), [goTo]);

  const running =
    rotating &&
    !reduceMotion &&
    !userPaused &&
    !touching &&
    isFocused &&
    appActive;

  // Run the active segment; resuming continues from where it stopped.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restarts per slide (index)
  useEffect(() => {
    if (!running) {
      cancelAnimation(progress);
      return;
    }
    const remaining = SLIDE_MS * (1 - Math.min(1, progress.value));
    progress.value = withTiming(
      1,
      { duration: Math.max(0, remaining), easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(advance)();
      },
    );
    return () => cancelAnimation(progress);
  }, [running, index, advance, progress]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      settleOn(Math.round(e.nativeEvent.contentOffset.x / width));
      setTouching(false);
    },
    [settleOn, width],
  );

  if (count === 0) return null;

  return (
    <View accessibilityLabel="Spotlight">
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={rotating}
        decelerationRate="fast"
        // A drag that settles without momentum still ends the touch.
        onScrollBeginDrag={() => setTouching(true)}
        onScrollEndDrag={(e) => {
          if ((e.nativeEvent.velocity?.x ?? 0) === 0) onMomentumEnd(e);
        }}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({
          length: width,
          offset: width * i,
          index: i,
        })}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        windowSize={3}
        renderItem={({ item, index: i }) => (
          <View style={{ width, paddingHorizontal: H_PADDING, height }}>
            {renderSlide(item, { index: i, count, width: cardWidth })}
          </View>
        )}
      />

      {rotating ? (
        <View className="mt-3 flex-row items-center gap-3 px-4">
          <View className="flex-1 flex-row items-center gap-1.5">
            {slides.map((s, i) => (
              <Pressable
                key={s.key}
                onPress={() => goTo(i, true)}
                hitSlop={{ top: 14, bottom: 14 }}
                accessibilityRole="button"
                accessibilityLabel={`Show slide ${i + 1} of ${count}`}
                accessibilityState={{ selected: i === index }}
                className="flex-1"
              >
                <Segment
                  state={i < index ? "done" : i === index ? "active" : "todo"}
                  progress={progress}
                  staticFill={reduceMotion}
                />
              </Pressable>
            ))}
          </View>
          {reduceMotion ? null : (
            <Pressable
              onPress={() => {
                hapticSelection();
                setUserPaused((p) => !p);
              }}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={
                userPaused ? "Resume the spotlight" : "Pause the spotlight"
              }
              className="h-8 w-8 items-center justify-center rounded-full border border-border bg-card active:opacity-70"
            >
              <Icon
                name={userPaused ? "play" : "pause"}
                size={13}
                tone="foreground"
              />
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

function Segment({
  state,
  progress,
  staticFill,
}: {
  state: "done" | "active" | "todo";
  progress: SharedValue<number>;
  staticFill: boolean;
}) {
  // Only the segment on show animates; the others are plain views, so no
  // segment can keep a stale animated width.
  return (
    <View className="h-1 overflow-hidden rounded-full bg-border">
      {state === "done" || (state === "active" && staticFill) ? (
        <View className="h-full w-full rounded-full bg-primary" />
      ) : state === "active" ? (
        <ActiveFill progress={progress} />
      ) : null}
    </View>
  );
}

function ActiveFill({ progress }: { progress: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    width: `${Math.min(Math.max(progress.value, 0), 1) * 100}%`,
  }));
  return (
    <Animated.View className="h-full rounded-full bg-primary" style={style} />
  );
}
