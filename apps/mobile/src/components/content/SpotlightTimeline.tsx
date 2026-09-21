import { claimDrawerEdge } from "@/components/app/drawerGesture";
import type { SpotlightPlayback } from "@/components/content/SpotlightVideo";
import { hapticLight } from "@/lib/haptics";
import {
  formatPlaybackTime,
  scrubTarget,
} from "@abonten/core/content/playbackControls";
import { AppText, useReducedMotion } from "@abonten/ui-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { SystemGestureExclusionView } from "../../../modules/system-gesture-exclusion/src";

// The line along the foot of a Spotlight video. One element, three jobs:
//
//   * progress — how far through the clip playback is, animated on the UI
//     thread from the player's clock (SpotlightPlayback);
//   * loading  — while the player reports it is waiting on data (the first
//     load, a buffer refill), a light sweeps along the line. It is the
//     player's real state, shown only after a short grace so a quick refill
//     doesn't flash, and it never covers or blocks a control;
//   * scrubbing — drag along it (or tap a point) to seek. The line thickens,
//     a thumb and the target time appear, the video pauses on the frame
//     under the finger and resumes from there on release.
//
// Gesture priority: the pan only activates on a HORIZONTAL move and fails on
// a vertical one, so a swipe that starts on the line still pages the feed;
// once it activates the card tells the feed to stop scrolling (onScrubbing)
// so the page cannot move under the finger. Its touch strip is a thin band
// at the very bottom, clear of the action rail and the CTA above it.
//
// The strip runs edge to edge, and with Android gesture navigation a touch
// that starts near either edge belongs to the system Back gesture — a scrub
// from the start of the clip fired Back instead. The strip is therefore a
// SystemGestureExclusionView: Android leaves exactly that thin band to the
// app, and everywhere else keeps its Back gesture.

// The touch strip: kept to 20 px so it never reaches the CTA above it (the
// card leaves 22 px of bottom inset for exactly this).
const TRACK_HIT = 20;
const SEEK_EVERY_MS = 80;

export function SpotlightTimeline({
  playback,
  waiting,
  bottom,
  onScrubbing,
}: {
  playback: SpotlightPlayback;
  /** The active video is loading or rebuffering (SpotlightVideo). */
  waiting: boolean;
  /** Distance from the card's bottom edge. */
  bottom: number;
  onScrubbing: (scrubbing: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  // Destructured: a worklet must capture the shared values themselves, not
  // the object holding the mutable `seek` ref (Reanimated freezes anything
  // a worklet captures, and the player reassigns that ref on every page).
  const { time, duration, seek } = playback;
  const width = useSharedValue(0);
  const scrubbing = useSharedValue(0);
  const scrubTime = useSharedValue(0);
  const [label, setLabel] = useState<string | null>(null);

  // A seek per animation frame would queue up faster than the decoder can
  // honour; one every ~80 ms keeps the picture following the finger.
  const lastSeek = useRef(0);
  const seekSoon = useCallback(
    (t: number) => {
      const now = Date.now();
      if (now - lastSeek.current < SEEK_EVERY_MS) return;
      lastSeek.current = now;
      seek.current?.(t);
    },
    [seek],
  );
  const showLabel = useCallback(
    (t: number) =>
      setLabel(
        `${formatPlaybackTime(t)} / ${formatPlaybackTime(duration.value)}`,
      ),
    [duration],
  );
  const begin = useCallback(() => {
    hapticLight();
    onScrubbing(true);
  }, [onScrubbing]);
  const finish = useCallback(
    (t: number | null) => {
      if (t !== null) seek.current?.(t);
      setLabel(null);
      onScrubbing(false);
    },
    [seek, onScrubbing],
  );

  const target = (x: number) => {
    "worklet";
    return scrubTarget(x, width.value, duration.value);
  };

  // The drawer's edge catcher lies over the strip's first 22 dp; a drag from
  // there is a scrub, not a request for the menu, so the strip claims its
  // rows of the edge while it is on screen (drawerGesture.ts).
  const stripRef = useRef<View>(null);
  const releaseClaim = useRef<(() => void) | null>(null);
  const claimEdge = useCallback(() => {
    stripRef.current?.measureInWindow((_x, y, _w, h) => {
      releaseClaim.current?.();
      releaseClaim.current = claimDrawerEdge({ top: y - 8, bottom: y + h });
    });
  }, []);
  useEffect(() => () => releaseClaim.current?.(), []);

  const pan = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-14, 14])
    .hitSlop({ top: 8 })
    .onStart((e) => {
      const t = target(e.x);
      if (t === null) return;
      scrubbing.value = withTiming(1, { duration: 120 });
      scrubTime.value = t;
      runOnJS(begin)();
      runOnJS(showLabel)(t);
    })
    .onUpdate((e) => {
      const t = target(e.x);
      if (t === null) return;
      scrubTime.value = t;
      runOnJS(seekSoon)(t);
      runOnJS(showLabel)(t);
    })
    .onFinalize(() => {
      if (scrubbing.value === 0) return;
      scrubbing.value = withTiming(0, { duration: 160 });
      // Cancelled or not, the finger's last position is where it resumes.
      runOnJS(finish)(scrubTime.value);
    });

  // A tap on the line jumps there without dragging.
  const tap = Gesture.Tap()
    .hitSlop({ top: 8 })
    .onEnd((e) => {
      const t = target(e.x);
      if (t === null) return;
      runOnJS(finish)(t);
    });

  const gesture = Gesture.Exclusive(pan, tap);

  const shown = useDerivedValue(() =>
    scrubbing.value > 0 ? scrubTime.value : time.value,
  );
  const fillStyle = useAnimatedStyle(() => {
    const d = duration.value;
    const f = d > 0 ? Math.min(1, Math.max(0, shown.value / d)) : 0;
    return { width: f * width.value };
  });
  const trackStyle = useAnimatedStyle(() => ({
    height: 2 + scrubbing.value * 4,
    borderRadius: 1 + scrubbing.value * 2,
  }));
  const thumbStyle = useAnimatedStyle(() => {
    const d = duration.value;
    const f = d > 0 ? Math.min(1, Math.max(0, shown.value / d)) : 0;
    return {
      opacity: scrubbing.value,
      transform: [
        { translateX: f * width.value - 7 },
        { scale: 0.5 + scrubbing.value * 0.5 },
      ],
    };
  });

  return (
    <>
      {label ? (
        <View
          pointerEvents="none"
          style={[styles.labelWrap, { bottom: bottom + 44 }]}
        >
          <AppText
            className="text-[26px] font-bold text-white"
            style={styles.shadow}
          >
            {label}
          </AppText>
        </View>
      ) : null}
      <SystemGestureExclusionView style={[styles.hit, { bottom }]}>
        <GestureDetector gesture={gesture}>
          <View
            ref={stripRef}
            style={styles.strip}
            onLayout={(e) => {
              width.value = e.nativeEvent.layout.width;
              claimEdge();
            }}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Video position"
          >
            <Animated.View style={[styles.track, trackStyle]}>
              <Animated.View style={[styles.fill, fillStyle]} />
              {waiting ? <LoadingSweep reduceMotion={reduceMotion} /> : null}
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[styles.thumb, thumbStyle]}
            />
          </View>
        </GestureDetector>
      </SystemGestureExclusionView>
    </>
  );
}

/**
 * The loading light: a soft bright band sweeping along the line, looping
 * while the player waits. With reduce-motion on, the line pulses instead.
 */
function LoadingSweep({ reduceMotion }: { reduceMotion: boolean }) {
  const x = useSharedValue(0);
  const visible = useSharedValue(0);
  useEffect(() => {
    visible.value = withTiming(1, { duration: 180 });
    x.value = withRepeat(
      withTiming(1, {
        duration: reduceMotion ? 900 : 1100,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      reduceMotion,
    );
    return () => cancelAnimation(x);
  }, [x, visible, reduceMotion]);
  const style = useAnimatedStyle(() =>
    reduceMotion
      ? { opacity: visible.value * (0.35 + 0.5 * x.value), left: 0, right: 0 }
      : {
          opacity: visible.value,
          left: `${-35 + x.value * 135}%`,
          width: "35%",
        },
  );
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel="Loading video"
      style={[styles.sweep, style]}
    />
  );
}

const styles = StyleSheet.create({
  hit: {
    position: "absolute",
    left: 0,
    right: 0,
    height: TRACK_HIT,
  },
  strip: {
    flex: 1,
    justifyContent: "flex-end",
    paddingBottom: 4,
  },
  track: {
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  sweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "#ffffff",
    borderRadius: 2,
  },
  thumb: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#ffffff",
  },
  labelWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  shadow: {
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
