import { useDeleteHighlightSlide } from "@/features/profile/useHighlights";
import { hapticLight } from "@/lib/haptics";
import type { HighlightGroup } from "@abonten/types/highlightType";
import { AppText, Avatar, Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Native WhatsApp-Status / Instagram-Highlights player, rebuilt on
// react-native-gesture-handler + reanimated so the progress bar and the
// drag-to-dismiss run on the UI thread. Behaviour mirrors the web
// `useHighlightViewer` hook:
//   • tap left third → previous slide, tap the rest → next slide
//   • press-and-hold → pause + hide all chrome; release → resume
//   • drag down → dismiss (tracks the finger); horizontal fling → prev / next
//     GROUP (previous lands on that group's last slide, like web)
//   • image slides run a fixed dwell that freezes on hold and resumes from
//     where it stopped; video slides play through and drive the bar from
//     their own time updates
//   • loading never counts toward view time — the timer only starts once the
//     media signals it is ready
//   • on your own profile a ⋯ menu removes the current slide

const IMAGE_DURATION_MS = 5000;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;
const GROUP_SWIPE_DISTANCE = 60;
const GROUP_SLIDE_MS = 190;

type Props = {
  groups: HighlightGroup[];
  initialGroupIndex: number;
  username: string;
  onClose: () => void;
  canManage?: boolean;
  userId?: string;
  avatarPublicId?: string | null;
  avatarVersion?: number | string | null;
};

export function HighlightViewer({
  groups,
  initialGroupIndex,
  username,
  onClose,
  canManage = false,
  userId,
  avatarPublicId,
  avatarVersion,
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [slideIndex, setSlideIndex] = useState(0);
  const [holding, setHolding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const group = groups[groupIndex] ?? [];
  const slide = group[slideIndex];
  const isVideo = slide?.media_type === "video";
  const paused = holding || menuOpen;

  const deleteSlide = useDeleteHighlightSlide(userId);

  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  const transX = useSharedValue(0);
  const chrome = useSharedValue(1);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.25;
  });

  // expo-video releases the player synchronously when this component
  // unmounts (which is exactly what closing the viewer does). Any effect
  // cleanup or listener that touches `player` after that throws
  // "Cannot use shared object that was already released" — and a throw
  // during React's unmount commit leaves Fabric mid-mount, which then
  // surfaces as the "child already has a parent" / addViewAt crash on the
  // next frame. Route every player call through here so a released player
  // is a silent no-op.
  const runPlayer = useCallback(
    (fn: (p: typeof player) => void) => {
      try {
        fn(player);
      } catch {
        // player not ready yet, or already released on unmount
      }
    },
    [player],
  );

  // onClose unmounts us; guard against the drag-dismiss timing callback and
  // a stray tap both firing it.
  const closedRef = useRef(false);
  const close = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    runPlayer((p) => p.pause());
    onClose();
  }, [onClose, runPlayer]);

  // ---- navigation -------------------------------------------------------
  const goToGroup = useCallback(
    (next: number, landOnLast = false) => {
      if (next < 0 || next >= groups.length) {
        close();
        return;
      }
      hapticLight();
      setGroupIndex(next);
      setSlideIndex(
        landOnLast ? Math.max(0, (groups[next]?.length ?? 1) - 1) : 0,
      );
    },
    [groups, close],
  );

  // WhatsApp-Status-style horizontal transition between highlight GROUPS:
  // slide the current group out, swap state at the midpoint, then slide the
  // next one in from the opposite edge. `dir` is +1 for the next group,
  // -1 for the previous (which lands on its last slide, like web).
  const animateGroupSwipe = useCallback(
    (dir: 1 | -1) => {
      const target = groupIndex + dir;
      if (target < 0 || target >= groups.length) {
        close();
        return;
      }
      transX.value = withTiming(
        -dir * width,
        { duration: GROUP_SLIDE_MS },
        (finished) => {
          if (!finished) return;
          runOnJS(goToGroup)(target, dir === -1);
          transX.value = dir * width;
          transX.value = withTiming(0, { duration: GROUP_SLIDE_MS });
        },
      );
    },
    [groupIndex, groups.length, width, transX, goToGroup, close],
  );

  const nextSlide = useCallback(() => {
    if (slideIndex + 1 < group.length) setSlideIndex((i) => i + 1);
    else goToGroup(groupIndex + 1);
  }, [slideIndex, group.length, goToGroup, groupIndex]);

  const prevSlide = useCallback(() => {
    if (slideIndex - 1 >= 0) setSlideIndex((i) => i - 1);
    else goToGroup(groupIndex - 1, true);
  }, [slideIndex, goToGroup, groupIndex]);

  const nextGroup = useCallback(
    () => animateGroupSwipe(1),
    [animateGroupSwipe],
  );
  const prevGroup = useCallback(
    () => animateGroupSwipe(-1),
    [animateGroupSwipe],
  );

  // ---- reset per slide ------------------------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the slide identity; progress is a stable shared value
  useEffect(() => {
    cancelAnimation(progress);
    progress.value = 0;
    setLoaded(false);
  }, [slide?.id]);

  // ---- chrome fade with hold ---------------------------------------
  useEffect(() => {
    chrome.value = withTiming(holding ? 0 : 1, { duration: 150 });
  }, [holding, chrome]);

  // ---- video: load the current slide ---------------------------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the slide identity; player is stable
  useEffect(() => {
    if (!slide || !isVideo) return;
    let cancelled = false;
    (async () => {
      try {
        await player.replaceAsync({ uri: slide.media_url });
        if (cancelled) return;
        if (!paused) player.play();
      } catch {
        if (!cancelled) nextSlide();
      }
    })();
    return () => {
      cancelled = true;
      runPlayer((p) => p.pause());
    };
  }, [slide?.id, isVideo]);

  // ---- video: readiness + advance + drive the bar ------------------
  useEffect(() => {
    if (!isVideo) return;
    let statusSub: { remove: () => void } | undefined;
    let endSub: { remove: () => void } | undefined;
    let timeSub: { remove: () => void } | undefined;
    runPlayer((p) => {
      statusSub = p.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay") setLoaded(true);
      });
      endSub = p.addListener("playToEnd", () => nextSlide());
      timeSub = p.addListener("timeUpdate", (e) => {
        const dur = p.duration || slide?.media_duration || 0;
        if (dur > 0) progress.value = Math.min(1, e.currentTime / dur);
      });
    });
    return () => {
      try {
        statusSub?.remove();
        endSub?.remove();
        timeSub?.remove();
      } catch {
        // player released on unmount
      }
    };
  }, [isVideo, nextSlide, progress, slide?.media_duration, runPlayer]);

  // ---- video: pause / resume with the shared paused state ----------
  useEffect(() => {
    if (!isVideo) return;
    if (paused) runPlayer((p) => p.pause());
    else if (loaded) runPlayer((p) => p.play());
  }, [paused, isVideo, loaded, runPlayer]);

  // ---- image: run / freeze / resume the dwell timer ---------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on slide identity; progress is a stable shared value
  useEffect(() => {
    if (!slide || isVideo || !loaded) return;
    if (paused) {
      cancelAnimation(progress);
      return;
    }
    const remaining = IMAGE_DURATION_MS * (1 - progress.value);
    progress.value = withTiming(
      1,
      { duration: Math.max(0, remaining), easing: Easing.linear },
      (finished) => {
        if (finished) runOnJS(nextSlide)();
      },
    );
    return () => cancelAnimation(progress);
  }, [slide?.id, isVideo, loaded, paused, nextSlide]);

  // ---- gestures (created per render, like ImageViewer) --------------
  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      if (e.x < width / 3) runOnJS(prevSlide)();
      else runOnJS(nextSlide)();
    });

  const longPress = Gesture.LongPress()
    .minDuration(200)
    .maxDistance(10_000)
    .onStart(() => runOnJS(setHolding)(true))
    .onFinalize(() => runOnJS(setHolding)(false));

  const pan = Gesture.Pan()
    .minDistance(14)
    .onUpdate((e) => {
      // Follow the finger: horizontal drag scrubs toward the next/prev
      // group (WhatsApp-style), a downward drag scrubs toward dismiss.
      if (Math.abs(e.translationX) > Math.abs(e.translationY)) {
        transX.value = e.translationX;
        dragY.value = 0;
      } else if (e.translationY > 0) {
        dragY.value = e.translationY;
        transX.value = 0;
      }
    })
    .onEnd((e) => {
      const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);

      if (
        !horizontal &&
        (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY)
      ) {
        dragY.value = withTiming(height, { duration: 160 }, (f) => {
          if (f) runOnJS(close)();
        });
        return;
      }

      if (
        horizontal &&
        (Math.abs(e.translationX) > GROUP_SWIPE_DISTANCE ||
          Math.abs(e.velocityX) > DISMISS_VELOCITY)
      ) {
        runOnJS(animateGroupSwipe)(e.translationX < 0 ? 1 : -1);
        dragY.value = withSpring(0, { damping: 18 });
        return;
      }

      // Not far enough — settle everything back.
      transX.value = withSpring(0, { damping: 18 });
      dragY.value = withSpring(0, { damping: 18 });
    });

  const gesture = Gesture.Race(pan, longPress, tap);

  // ---- animated styles ----------------------------------------------
  const surfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: transX.value }, { translateY: dragY.value }],
    opacity: interpolate(
      Math.abs(dragY.value) + Math.abs(transX.value),
      [0, height],
      [1, 0.4],
    ),
  }));
  const chromeStyle = useAnimatedStyle(() => ({ opacity: chrome.value }));
  const activeBarStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, progress.value * 100))}%`,
  }));

  // ---- delete --------------------------------------------------------
  const onDelete = () => {
    if (!slide) return;
    setMenuOpen(false);
    Alert.alert(
      `Delete this ${isVideo ? "video" : "photo"}?`,
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deleteSlide.mutate(slide.id, {
              onSuccess: () => {
                if (group.length <= 1) goToGroup(groupIndex + 1);
                else
                  setSlideIndex((i) =>
                    Math.max(0, Math.min(i, group.length - 2)),
                  );
              },
              onError: (err) =>
                Alert.alert(
                  "Couldn't delete",
                  err instanceof Error ? err.message : "Please try again.",
                ),
            }),
        },
      ],
    );
  };

  const backdrop = isVideo
    ? (slide?.thumbnail_url ?? undefined)
    : slide?.media_url;

  if (!slide) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[{ flex: 1 }, surfaceStyle]}>
              {backdrop ? (
                <Image
                  source={{ uri: backdrop }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  blurRadius={40}
                  transition={120}
                />
              ) : null}
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: "rgba(0,0,0,0.45)" },
                ]}
              />

              {isVideo ? (
                <VideoView
                  player={player}
                  style={{ position: "absolute", width, height }}
                  contentFit="contain"
                  nativeControls={false}
                />
              ) : (
                <Image
                  source={{ uri: slide.media_url }}
                  style={{ position: "absolute", width, height }}
                  contentFit="contain"
                  transition={150}
                  onLoadEnd={() => setLoaded(true)}
                  onError={() => nextSlide()}
                />
              )}

              {!loaded ? (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { alignItems: "center", justifyContent: "center" },
                  ]}
                  pointerEvents="none"
                >
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
            </Animated.View>
          </GestureDetector>

          {/* chrome — a sibling of the gesture surface (like ImageViewer's
              close button) so its buttons get their taps cleanly and it
              stays put while the content drags to dismiss. */}
          <Animated.View
            style={[
              { position: "absolute", left: 0, right: 0, top: insets.top + 8 },
              chromeStyle,
            ]}
            pointerEvents={holding ? "none" : "box-none"}
          >
            <View className="flex-row gap-1 px-3">
              {group.map((s, i) => (
                <View
                  key={s.id}
                  className="h-[3px] flex-1 overflow-hidden rounded-full"
                  style={{ backgroundColor: "rgba(255,255,255,0.4)" }}
                >
                  {i < slideIndex ? (
                    <View style={{ flex: 1, backgroundColor: "#fff" }} />
                  ) : i === slideIndex ? (
                    <Animated.View
                      style={[
                        { height: "100%", backgroundColor: "#fff" },
                        activeBarStyle,
                      ]}
                    />
                  ) : null}
                </View>
              ))}
            </View>

            <View className="mt-3 flex-row items-center gap-2 px-3">
              <Pressable onPress={close} hitSlop={10}>
                <Icon name="arrow-back" size={24} color="#fff" />
              </Pressable>
              <Avatar
                publicId={avatarPublicId ?? undefined}
                version={avatarVersion ?? undefined}
                size={32}
              />
              <AppText
                className="flex-1 text-[14px] font-semibold text-white"
                numberOfLines={1}
              >
                {username}
              </AppText>
              <Icon
                name={paused ? "pause" : "play"}
                size={18}
                color="rgba(255,255,255,0.9)"
              />
              {canManage ? (
                <Pressable
                  onPress={() => setMenuOpen((v) => !v)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Slide options"
                >
                  <Icon name="ellipsis-vertical" size={20} color="#fff" />
                </Pressable>
              ) : null}
            </View>
          </Animated.View>

          {/* ⋯ menu — an in-Modal popover, not a nested Modal. Its scrim
              keeps playback paused (menuOpen ⇒ paused) but leaves chrome up. */}
          {menuOpen && canManage ? (
            <>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => setMenuOpen(false)}
              />
              <View
                style={{
                  position: "absolute",
                  right: 12,
                  top: insets.top + 52,
                }}
                className="overflow-hidden rounded-xl border border-border bg-popover"
              >
                <Pressable
                  onPress={onDelete}
                  disabled={deleteSlide.isPending}
                  className="min-h-[44px] flex-row items-center gap-2 px-4 py-3 active:opacity-70"
                >
                  <Icon name="trash-outline" size={18} tone="destructive" />
                  <AppText variant="small" tone="error" className="font-medium">
                    Delete {isVideo ? "video" : "photo"}
                  </AppText>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
