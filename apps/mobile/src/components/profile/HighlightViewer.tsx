import { useDeleteHighlightSlide } from "@/features/profile/useHighlights";
import type { HighlightGroup } from "@abonten/types/highlightType";
import { Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

// Native echo of the web `HighlightViewer` organism: a WhatsApp-Status /
// Instagram-highlights player. Progress bars across the top, tap the left /
// right half to step, press-and-hold to pause, auto-advances between slides
// and rolls on to the next group at the end. Image slides play for a fixed
// dwell; video slides play through with `expo-video` and advance on end.
// When `canManage` (own profile) the header shows a delete button that
// removes the current slide.

const IMAGE_DURATION_MS = 5000;

type Props = {
  groups: HighlightGroup[];
  initialGroupIndex: number;
  username: string;
  onClose: () => void;
  canManage?: boolean;
  userId?: string;
};

export function HighlightViewer({
  groups,
  initialGroupIndex,
  username,
  onClose,
  canManage = false,
  userId,
}: Props) {
  const { width, height } = useWindowDimensions();
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const group = groups[groupIndex] ?? [];
  const slide = group[slideIndex];
  const isVideo = slide?.media_type === "video";

  const deleteSlide = useDeleteHighlightSlide(userId);

  const progress = useRef(new Animated.Value(0)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);

  // Swipe-down-to-close — the familiar Stories dismiss gesture. Claims the
  // responder only on a clear downward drag, so quick taps and press-hold
  // still reach the tap/hold surface below.
  const dragY = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) =>
          g.dy > 12 && g.dy > Math.abs(g.dx) * 1.5,
        onPanResponderMove: (_e, g) => {
          if (g.dy > 0) dragY.setValue(g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 120 || g.vy > 1.2) {
            Animated.timing(dragY, {
              toValue: height,
              duration: 160,
              useNativeDriver: true,
            }).start(() => onClose());
          } else {
            Animated.spring(dragY, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 4,
            }).start();
          }
        },
      }),
    [dragY, height, onClose],
  );

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.2;
  });

  const goToGroup = useCallback(
    (next: number) => {
      if (next < 0) return;
      if (next >= groups.length) {
        onClose();
        return;
      }
      setGroupIndex(next);
      setSlideIndex(0);
    },
    [groups.length, onClose],
  );

  const nextSlide = useCallback(() => {
    if (slideIndex + 1 < group.length) {
      setSlideIndex((i) => i + 1);
    } else {
      goToGroup(groupIndex + 1);
    }
  }, [slideIndex, group.length, goToGroup, groupIndex]);

  const prevSlide = useCallback(() => {
    if (slideIndex - 1 >= 0) {
      setSlideIndex((i) => i - 1);
    } else {
      goToGroup(groupIndex - 1);
    }
  }, [slideIndex, goToGroup, groupIndex]);

  // Load / play the current video slide.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the slide identity; player is stable.
  useEffect(() => {
    if (!slide || !isVideo) return;
    let cancelled = false;
    progress.setValue(0);
    (async () => {
      try {
        await player.replaceAsync({ uri: slide.media_url });
        if (cancelled) return;
        if (!paused) player.play();
      } catch {
        // A failed video load shouldn't strand the viewer — move on.
        if (!cancelled) nextSlide();
      }
    })();
    return () => {
      cancelled = true;
      player.pause();
    };
  }, [slide?.id, isVideo]);

  // Advance a video slide on end + drive its progress bar.
  useEffect(() => {
    if (!isVideo) return;
    const endSub = player.addListener("playToEnd", () => nextSlide());
    const timeSub = player.addListener("timeUpdate", (e) => {
      const dur = player.duration || slide?.media_duration || 0;
      if (dur > 0) progress.setValue(Math.min(1, e.currentTime / dur));
    });
    return () => {
      endSub.remove();
      timeSub.remove();
    };
  }, [isVideo, player, nextSlide, progress, slide?.media_duration]);

  // Pause / resume the video with the shared paused state.
  useEffect(() => {
    if (!isVideo) return;
    if (paused) player.pause();
    else player.play();
  }, [paused, isVideo, player]);

  // Drive the active bar for image slides; on completion advance.
  useEffect(() => {
    if (!slide || isVideo || paused) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: IMAGE_DURATION_MS,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) nextSlide();
    });
    return () => anim.stop();
  }, [slide, isVideo, paused, progress, nextSlide]);

  const onPressIn = () => {
    heldRef.current = false;
    holdTimer.current = setTimeout(() => {
      heldRef.current = true;
      setPaused(true);
    }, 200);
  };

  const onPressOut = (x: number) => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (heldRef.current) {
      setPaused(false);
      heldRef.current = false;
      return;
    }
    // A genuine tap: left third steps back, the rest steps forward.
    if (x < width / 3) prevSlide();
    else nextSlide();
  };

  const onDelete = () => {
    if (!slide) return;
    Alert.alert("Delete this slide?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteSlide.mutate(slide.id, {
            onSuccess: () => {
              // If it was the last slide in the group, the group is gone.
              if (group.length <= 1) goToGroup(groupIndex + 1);
              else
                setSlideIndex((i) =>
                  Math.max(0, Math.min(i, group.length - 2)),
                );
            },
            onError: (e) =>
              Alert.alert(
                "Couldn't delete",
                e instanceof Error ? e.message : "Please try again.",
              ),
          }),
      },
    ]);
  };

  const bg = useMemo(
    () => (isVideo ? (slide?.thumbnail_url ?? undefined) : slide?.media_url),
    [isVideo, slide],
  );

  if (!slide) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <Animated.View
          style={{ flex: 1, transform: [{ translateY: dragY }] }}
          {...panResponder.panHandlers}
        >
          {isVideo ? (
            <VideoView
              player={player}
              style={{ position: "absolute", width, height }}
              contentFit="contain"
              nativeControls={false}
            />
          ) : null}
          {bg ? (
            <Image
              source={{ uri: bg }}
              style={{ position: "absolute", width, height }}
              contentFit="contain"
              transition={120}
              onError={() => nextSlide()}
            />
          ) : null}

          {/* progress bars */}
          <View
            className="absolute left-0 right-0 flex-row gap-1 px-3"
            style={{ top: 12 }}
          >
            {group.map((s, i) => (
              <View
                key={s.id}
                className="h-1 flex-1 overflow-hidden rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.4)" }}
              >
                <Animated.View
                  style={{
                    height: "100%",
                    backgroundColor: "#fff",
                    width:
                      i < slideIndex
                        ? "100%"
                        : i === slideIndex
                          ? progress.interpolate({
                              inputRange: [0, 1],
                              outputRange: ["0%", "100%"],
                            })
                          : "0%",
                  }}
                />
              </View>
            ))}
          </View>

          {/* header */}
          <View
            className="absolute left-0 right-0 flex-row items-center gap-2 px-3"
            style={{ top: 26 }}
          >
            <Text
              className="flex-1 text-sm font-bold text-white"
              numberOfLines={1}
            >
              {username}
            </Text>
            {canManage ? (
              <Pressable
                onPress={onDelete}
                hitSlop={12}
                disabled={deleteSlide.isPending}
                accessibilityRole="button"
                accessibilityLabel="Delete slide"
              >
                <Icon name="trash-outline" size={22} color="#fff" />
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={12}>
              <Icon name="close" size={24} color="#fff" />
            </Pressable>
          </View>

          {/* tap / hold surface */}
          <Pressable
            style={{ flex: 1 }}
            onPressIn={onPressIn}
            onPressOut={(e) => onPressOut(e.nativeEvent.locationX)}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}
