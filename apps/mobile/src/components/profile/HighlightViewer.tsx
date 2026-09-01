import type { HighlightGroup } from "@abonten/types/highlightType";
import { Icon } from "@abonten/ui-native";
import { Image } from "expo-image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

// Native echo of the web `HighlightViewer` organism: a WhatsApp-Status /
// Instagram-highlights player. Progress bars across the top, tap the left /
// right half to step, press-and-hold to pause, auto-advances between slides
// and rolls on to the next group at the end. Image slides only for now —
// video/audio slides show their thumbnail for the same dwell (native video
// playback needs expo-video, deferred).

const IMAGE_DURATION_MS = 5000;

type Props = {
  groups: HighlightGroup[];
  initialGroupIndex: number;
  username: string;
  onClose: () => void;
};

export function HighlightViewer({
  groups,
  initialGroupIndex,
  username,
  onClose,
}: Props) {
  const { width, height } = useWindowDimensions();
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const group = groups[groupIndex] ?? [];
  const slide = group[slideIndex];

  const progress = useRef(new Animated.Value(0)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldRef = useRef(false);

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

  // Drive the active bar; on completion advance. Restarts whenever the slide
  // changes or playback resumes.
  useEffect(() => {
    if (!slide || paused) return;
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
  }, [slide, paused, progress, nextSlide]);

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

  const bg = useMemo(
    () =>
      slide?.media_type === "video"
        ? (slide.thumbnail_url ?? slide.media_url)
        : slide?.media_url,
    [slide],
  );

  if (!slide) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {bg ? (
          <Image
            source={{ uri: bg }}
            style={{ position: "absolute", width, height }}
            contentFit="contain"
            transition={120}
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
      </View>
    </Modal>
  );
}
