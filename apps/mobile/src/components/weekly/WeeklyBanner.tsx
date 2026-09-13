import { hapticSelection } from "@/lib/haptics";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import type { WeeklyBannerSlide } from "@abonten/types/weeklyType";
import { AppText, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { Image } from "expo-image";
import { useIsFocused } from "expo-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
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
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

// The Abonten Weekly banner in the app: the Explore teaser and the edition
// masthead. The edition's listings fill the banner and take turns behind the
// text with a cross-fade and a slow drift; a caption opens the listing on
// show; story-style segments show progress and can be tapped; swipe left or
// right to move. Rotation pauses while the screen is not in front, while the
// app is in the background, while a finger is on the banner, when the person
// pauses it, and never runs with the OS "reduce motion" setting.

const SLIDE_MS = 6500;
const FADE_MS = 900;
const INK = "#05080d";
const GLASS = "rgba(255,255,255,0.14)";
const GLASS_BORDER = "rgba(255,255,255,0.22)";
const WHITE_80 = "rgba(255,255,255,0.8)";

export function WeeklyBanner({
  slides,
  height,
  eyebrow,
  children,
  onPress,
  accessibilityLabel,
  onSlidePress,
}: {
  slides: WeeklyBannerSlide[];
  height: number;
  eyebrow: ReactNode;
  children: ReactNode;
  /** When set, tapping the banner opens the edition (the teaser). */
  onPress?: () => void;
  accessibilityLabel?: string;
  onSlidePress: (slide: WeeklyBannerSlide) => void;
}) {
  const count = slides.length;
  const rotating = count > 1;
  const reduceMotion = useReducedMotion();
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  const [userPaused, setUserPaused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [index, setIndex] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [mounted, setMounted] = useState<Set<number>>(
    () => new Set(count > 1 ? [0, 1] : [0]),
  );
  const indexRef = useRef(0);
  const cycleRef = useRef(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) =>
      setAppActive(s === "active"),
    );
    return () => sub.remove();
  }, []);

  const running =
    rotating &&
    !reduceMotion &&
    !userPaused &&
    !touching &&
    isFocused &&
    appActive;

  const progress = useSharedValue(0);

  const go = useCallback(
    (next: number, fromUser = false) => {
      if (count === 0) return;
      const target = ((next % count) + count) % count;
      if (fromUser) hapticSelection();
      indexRef.current = target;
      cycleRef.current += 1;
      elapsedRef.current = 0;
      progress.value = 0;
      setIndex(target);
      setCycle(cycleRef.current);
      setMounted((prev) => {
        const after = (target + 1) % count;
        if (prev.has(target) && prev.has(after)) return prev;
        const copy = new Set(prev);
        copy.add(target);
        copy.add(after);
        return copy;
      });
    },
    [count, progress],
  );

  // Progress of the slide on show, 0..1. Restarts on every change; pausing
  // keeps the position and resuming finishes the remaining time. Elapsed time
  // is tracked here on the JS side: a shared value read from JS can still
  // hold the previous slide's finished position, which would start the next
  // slide with no time left.
  const onSlideDone = useCallback(
    (doneCycle: number) => {
      // A callback from a slide that has since been replaced is ignored.
      if (doneCycle === cycleRef.current) go(indexRef.current + 1);
    },
    [go],
  );

  useEffect(() => {
    if (!running) {
      cancelAnimation(progress);
      progress.value = elapsedRef.current / SLIDE_MS;
      return;
    }
    const startedAt = Date.now();
    const startCycle = cycle;
    const remaining = Math.max(0, SLIDE_MS - elapsedRef.current);
    progress.value = elapsedRef.current / SLIDE_MS;
    progress.value = withTiming(
      1,
      { duration: remaining, easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(onSlideDone)(startCycle);
      },
    );
    return () => {
      cancelAnimation(progress);
      if (cycleRef.current === startCycle) {
        elapsedRef.current = Math.min(
          SLIDE_MS,
          elapsedRef.current + (Date.now() - startedAt),
        );
      }
    };
  }, [running, cycle, onSlideDone, progress]);

  // Called from the gesture worklet; reads the index on the JS side.
  const swipeBy = useCallback(
    (direction: number) => go(indexRef.current + direction, true),
    [go],
  );

  const swipe = Gesture.Pan()
    .enabled(rotating)
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      runOnJS(setTouching)(true);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 48 || Math.abs(e.velocityX) > 500) {
        runOnJS(swipeBy)(e.translationX < 0 ? 1 : -1);
      }
    })
    .onFinalize(() => {
      runOnJS(setTouching)(false);
    });

  const slide = count > 0 ? slides[index] : null;

  return (
    <GestureDetector gesture={swipe}>
      <View
        className="mx-4 overflow-hidden rounded-3xl"
        style={{ height, backgroundColor: INK }}
      >
        <View
          style={StyleSheet.absoluteFill}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          pointerEvents="none"
        >
          {count === 0 ? (
            <BrandBackdrop />
          ) : (
            slides.map((s, i) =>
              mounted.has(i) ? (
                <SlideLayer
                  key={s.key}
                  slide={s}
                  active={i === index}
                  animate={rotating && !reduceMotion}
                  cycle={i === index ? cycle : -1}
                />
              ) : null,
            )
          )}
          <Scrim />
        </View>

        {onPress ? (
          <Pressable
            onPress={onPress}
            onPressIn={() => setTouching(true)}
            onPressOut={() => setTouching(false)}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={StyleSheet.absoluteFill}
            android_ripple={{ color: "rgba(255,255,255,0.08)" }}
          />
        ) : null}

        <View className="flex-1 justify-between p-5" pointerEvents="box-none">
          <View
            className="flex-row items-start justify-between gap-3"
            pointerEvents="box-none"
          >
            <View
              className="flex-1 flex-row flex-wrap items-center gap-2"
              pointerEvents="none"
            >
              {eyebrow}
            </View>
            {rotating && !reduceMotion ? (
              <Pressable
                onPress={() => {
                  hapticSelection();
                  setUserPaused((p) => !p);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={
                  userPaused ? "Resume the slideshow" : "Pause the slideshow"
                }
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{
                  backgroundColor: "rgba(0,0,0,0.3)",
                  borderWidth: 1,
                  borderColor: GLASS_BORDER,
                }}
              >
                <Icon
                  name={userPaused ? "play" : "pause"}
                  size={15}
                  color="#fff"
                />
              </Pressable>
            ) : null}
          </View>

          <View className="gap-4" pointerEvents="box-none">
            <View pointerEvents="none">{children}</View>

            {slide ? (
              <Pressable
                onPress={() => onSlidePress(slide)}
                accessibilityRole="link"
                accessibilityLabel={`Open ${slide.subjectType === "event" ? "event" : "place"}: ${slide.title}${slide.meta ? `, ${slide.meta}` : ""}`}
                className="flex-row items-center gap-3 rounded-2xl p-2 pr-3 active:opacity-80"
                style={{
                  backgroundColor: GLASS,
                  borderWidth: 1,
                  borderColor: GLASS_BORDER,
                }}
              >
                <View className="h-11 w-11 overflow-hidden rounded-xl bg-white/10">
                  <Image
                    source={{
                      uri: buildCloudinaryUrl(
                        slide.publicId,
                        slide.version ?? undefined,
                        { width: 44, height: 44 },
                      ),
                    }}
                    style={{ width: 44, height: 44 }}
                    contentFit="cover"
                    transition={250}
                  />
                </View>
                <View className="flex-1">
                  <AppText
                    className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: WHITE_80 }}
                    numberOfLines={1}
                  >
                    {slide.headline ??
                      (slide.subjectType === "event"
                        ? "Featured event"
                        : "Featured place")}
                  </AppText>
                  <AppText
                    className="text-[14px] font-semibold text-white"
                    numberOfLines={1}
                  >
                    {slide.title}
                  </AppText>
                  {slide.meta ? (
                    <AppText
                      className="text-[12px]"
                      style={{ color: WHITE_80 }}
                      numberOfLines={1}
                    >
                      {slide.meta}
                    </AppText>
                  ) : null}
                </View>
                <Icon name="arrow-forward" size={16} color="#fff" />
              </Pressable>
            ) : null}

            {rotating ? (
              <View className="flex-row items-center gap-1.5">
                {slides.map((s, i) => (
                  <Pressable
                    key={s.key}
                    onPress={() => go(i, true)}
                    hitSlop={{ top: 12, bottom: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Show pick ${i + 1} of ${count}: ${s.title}`}
                    accessibilityState={{ selected: i === index }}
                    className="flex-1"
                  >
                    <Segment
                      state={
                        i < index ? "done" : i === index ? "active" : "todo"
                      }
                      progress={progress}
                      staticFill={reduceMotion}
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </GestureDetector>
  );
}

function SlideLayer({
  slide,
  active,
  animate,
  cycle,
}: {
  slide: WeeklyBannerSlide;
  active: boolean;
  animate: boolean;
  cycle: number;
}) {
  const opacity = useSharedValue(active ? 1 : 0);
  const scale = useSharedValue(1.02);

  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, {
      duration: animate ? FADE_MS : 250,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, animate, opacity]);

  // A new drift each time this slide comes on; the outgoing slide keeps
  // drifting while it fades so nothing jumps.
  useEffect(() => {
    if (!animate || cycle < 0) return;
    scale.value = 1.02;
    scale.value = withTiming(1.12, {
      duration: SLIDE_MS + FADE_MS * 2,
      easing: Easing.out(Easing.quad),
    });
  }, [cycle, animate, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <Image
        source={{
          uri: buildCloudinaryUrl(slide.publicId, slide.version ?? undefined, {
            width: 540,
          }),
        }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
        recyclingKey={slide.key}
      />
    </Animated.View>
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
  // Only the segment on show animates; finished and upcoming ones are plain
  // views, so a segment can never keep a stale animated width.
  const full = state === "done" || (state === "active" && staticFill);
  return (
    <View
      className="h-[3px] overflow-hidden rounded-full"
      style={{ backgroundColor: "rgba(255,255,255,0.28)" }}
    >
      {full ? (
        <View
          style={{ height: "100%", width: "100%", backgroundColor: "#fff" }}
        />
      ) : state === "active" ? (
        <ActiveFill progress={progress} />
      ) : null}
    </View>
  );
}

function ActiveFill({ progress }: { progress: SharedValue<number> }) {
  const fill = useAnimatedStyle(() => ({
    width: `${Math.min(Math.max(progress.value, 0), 1) * 100}%`,
  }));
  return (
    <Animated.View
      style={[{ height: "100%", backgroundColor: "#fff" }, fill]}
    />
  );
}

function Scrim() {
  const c = useThemeColors();
  return (
    <Svg
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      width="100%"
      height="100%"
    >
      <Defs>
        <LinearGradient id="weekly-scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={INK} stopOpacity="0.5" />
          <Stop offset="0.25" stopColor={INK} stopOpacity="0.15" />
          <Stop offset="0.45" stopColor={INK} stopOpacity="0.55" />
          <Stop offset="0.7" stopColor={INK} stopOpacity="0.82" />
          <Stop offset="1" stopColor={INK} stopOpacity="0.94" />
        </LinearGradient>
        <RadialGradient id="weekly-glow" cx="0" cy="0" r="0.9">
          <Stop offset="0" stopColor={c.primary} stopOpacity="0.4" />
          <Stop offset="1" stopColor={c.primary} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#weekly-scrim)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#weekly-glow)" />
    </Svg>
  );
}

// Shown when no listing in the edition has an image.
function BrandBackdrop() {
  const c = useThemeColors();
  return (
    <Svg
      style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      width="100%"
      height="100%"
    >
      <Defs>
        <LinearGradient id="weekly-brand" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={c.primary} stopOpacity="1" />
          <Stop offset="0.55" stopColor="#115e59" stopOpacity="1" />
          <Stop offset="1" stopColor={INK} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#weekly-brand)" />
    </Svg>
  );
}
