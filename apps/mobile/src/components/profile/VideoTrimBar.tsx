import type { EditableMedia } from "@/features/profile/useHighlightComposer";
import {
  MAX_TRIM_SEGMENT_SECONDS,
  MIN_TRIM_SEGMENT_SECONDS,
} from "@/features/profile/useHighlights";
import formatDuration from "@abonten/core/formatVideoDuration";
import { AppText } from "@abonten/ui-native";
import type { VideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

// Native echo of the web `VideoTrimEditor`: a scrub track with two
// draggable handles + a draggable selection window + a playhead synced to
// the player's own time updates. Playback loops within the selected range.
// The raw clip is never re-encoded — the [start, end] window is handed back
// up and baked into the Cloudinary delivery URL at upload (see
// resolveTrimmedDelivery in useHighlights.ts).
//
// NOTE: this intentionally does NOT render a thumbnail filmstrip.
// expo-video's `generateThumbnailsAsync` crashes the app hard on iOS for
// some sources (uncatchable — it faults in the native retriever), so the
// track is a plain tick strip instead. The trim behaviour is unaffected.

const HANDLE_W = 22;
const TRACK_H = 56;
const TICK_COUNT = 6;
// Cap how often the drag handlers poke player.currentTime — a seek on every
// gesture frame can wedge the native player on some Android devices.
const SEEK_THROTTLE_MS = 60;

type Props = {
  player: VideoPlayer;
  item: EditableMedia;
  /** Fires continuously as the user drags. */
  onTrimChange: (startSeconds: number, endSeconds: number) => void;
};

export function VideoTrimBar({ player, item, onTrimChange }: Props) {
  const duration = Math.max(
    item.durationSeconds ?? player.duration ?? 0,
    0.001,
  );

  const [trackW, setTrackW] = useState(0);

  // px positions of the two handles' inner edges.
  const startX = useSharedValue(0);
  const endX = useSharedValue(0);
  const playX = useSharedValue(0);
  // drag anchors
  const startAnchor = useSharedValue(0);
  const endAnchor = useSharedValue(0);

  const secForX = useCallback(
    (x: number) => (trackW > 0 ? (x / trackW) * duration : 0),
    [trackW, duration],
  );
  const xForSec = useCallback(
    (s: number) => (duration > 0 ? (s / duration) * trackW : 0),
    [trackW, duration],
  );

  // Keep the latest committed window readable from the timeUpdate listener
  // without re-subscribing it on every drag frame.
  const windowRef = useRef({
    start: item.startSeconds ?? 0,
    end: item.endSeconds ?? duration,
  });

  // Sync handle px from props whenever the track is measured or the item's
  // trim values change from outside.
  // biome-ignore lint/correctness/useExhaustiveDependencies: shared values are stable
  useEffect(() => {
    if (trackW <= 0) return;
    const s = item.startSeconds ?? 0;
    const e = item.endSeconds ?? duration;
    startX.value = xForSec(s);
    endX.value = xForSec(e);
    windowRef.current = { start: s, end: e };
  }, [trackW, item.startSeconds, item.endSeconds, duration, xForSec]);

  // Playhead + loop-within-range. The seek back to `start` is wrapped —
  // a currentTime write can throw if the player was torn down between the
  // event firing and this handler running.
  useEffect(() => {
    const sub = player.addListener("timeUpdate", (e) => {
      const { start, end } = windowRef.current;
      playX.value = xForSec(e.currentTime);
      if (e.currentTime >= end || e.currentTime < start - 0.15) {
        try {
          player.currentTime = start;
        } catch {}
      }
    });
    return () => sub.remove();
  }, [player, playX, xForSec]);

  const commit = useCallback(() => {
    const s = secForX(startX.value);
    const e = secForX(endX.value);
    windowRef.current = { start: s, end: e };
    onTrimChange(s, e);
  }, [secForX, startX, endX, onTrimChange]);

  // Throttled + guarded seek used by the drag handlers.
  const lastSeekRef = useRef(0);
  const seekTo = useCallback(
    (seconds: number) => {
      const now = Date.now();
      if (now - lastSeekRef.current < SEEK_THROTTLE_MS) return;
      lastSeekRef.current = now;
      try {
        player.currentTime = Math.max(0, seconds);
      } catch {}
    },
    [player],
  );

  const minPx = xForSec(MIN_TRIM_SEGMENT_SECONDS);
  const maxPx = xForSec(MAX_TRIM_SEGMENT_SECONDS);

  const startDrag = Gesture.Pan()
    .onBegin(() => {
      startAnchor.value = startX.value;
    })
    .onUpdate((e) => {
      let nx = startAnchor.value + e.translationX;
      nx = Math.max(0, Math.min(nx, endX.value - minPx));
      if (endX.value - nx > maxPx) endX.value = nx + maxPx;
      startX.value = nx;
      runOnJS(seekTo)(secForX(nx));
    })
    .onEnd(() => runOnJS(commit)());

  const endDrag = Gesture.Pan()
    .onBegin(() => {
      endAnchor.value = endX.value;
    })
    .onUpdate((e) => {
      let nx = endAnchor.value + e.translationX;
      nx = Math.min(trackW, Math.max(nx, startX.value + minPx));
      if (nx - startX.value > maxPx) startX.value = nx - maxPx;
      endX.value = nx;
      runOnJS(seekTo)(secForX(nx));
    })
    .onEnd(() => runOnJS(commit)());

  const windowDrag = Gesture.Pan()
    .onBegin(() => {
      startAnchor.value = startX.value;
      endAnchor.value = endX.value;
    })
    .onUpdate((e) => {
      const span = endAnchor.value - startAnchor.value;
      let ns = startAnchor.value + e.translationX;
      ns = Math.max(0, Math.min(ns, trackW - span));
      startX.value = ns;
      endX.value = ns + span;
      runOnJS(seekTo)(secForX(ns));
    })
    .onEnd(() => runOnJS(commit)());

  const selectionStyle = useAnimatedStyle(() => ({
    left: startX.value,
    width: Math.max(0, endX.value - startX.value),
  }));
  const leftMaskStyle = useAnimatedStyle(() => ({ width: startX.value }));
  const rightMaskStyle = useAnimatedStyle(() => ({
    left: endX.value,
    width: Math.max(0, trackW - endX.value),
  }));
  const startHandleStyle = useAnimatedStyle(() => ({
    left: startX.value - HANDLE_W,
  }));
  const endHandleStyle = useAnimatedStyle(() => ({ left: endX.value }));
  const playheadStyle = useAnimatedStyle(() => ({ left: playX.value }));

  const onLayout = (ev: LayoutChangeEvent) =>
    setTrackW(ev.nativeEvent.layout.width);

  const startSec = item.startSeconds ?? 0;
  const endSec = item.endSeconds ?? duration;

  return (
    <View className="gap-2 px-4">
      <View className="flex-row justify-between">
        <AppText className="text-[12px] text-white/70">
          {formatDuration(startSec)}
        </AppText>
        <AppText className="text-[12px] font-semibold text-white">
          {formatDuration(Math.max(0, endSec - startSec))}
        </AppText>
        <AppText className="text-[12px] text-white/70">
          {formatDuration(endSec)}
        </AppText>
      </View>

      <View
        onLayout={onLayout}
        style={{ height: TRACK_H }}
        className="w-full overflow-visible rounded-lg"
      >
        {/* scrub track — plain tick strip (no thumbnail generation) */}
        <View
          className="absolute inset-0 flex-row overflow-hidden rounded-lg"
          style={{ backgroundColor: "#1f1f1f" }}
        >
          {Array.from({ length: TICK_COUNT }).map((_, i) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed tick cells
              key={i}
              style={{ flex: 1, height: "100%" }}
              className={
                i === 0 ? "bg-white/5" : "border-l border-white/10 bg-white/5"
              }
            />
          ))}
        </View>

        {/* dim the excluded portions */}
        <Animated.View
          className="absolute top-0 bottom-0 left-0 rounded-l-lg bg-black/60"
          style={leftMaskStyle}
          pointerEvents="none"
        />
        <Animated.View
          className="absolute top-0 bottom-0 rounded-r-lg bg-black/60"
          style={rightMaskStyle}
          pointerEvents="none"
        />

        {/* selected window — draggable */}
        <GestureDetector gesture={windowDrag}>
          <Animated.View
            className="absolute top-0 bottom-0 border-y-2 border-mint"
            style={selectionStyle}
          />
        </GestureDetector>

        {/* start handle */}
        <GestureDetector gesture={startDrag}>
          <Animated.View
            className="absolute top-0 bottom-0 items-center justify-center rounded-l-lg bg-mint"
            style={[{ width: HANDLE_W }, startHandleStyle]}
          >
            <View className="h-6 w-[3px] rounded-full bg-black/40" />
          </Animated.View>
        </GestureDetector>

        {/* end handle */}
        <GestureDetector gesture={endDrag}>
          <Animated.View
            className="absolute top-0 bottom-0 items-center justify-center rounded-r-lg bg-mint"
            style={[{ width: HANDLE_W }, endHandleStyle]}
          >
            <View className="h-6 w-[3px] rounded-full bg-black/40" />
          </Animated.View>
        </GestureDetector>

        {/* playhead */}
        <Animated.View
          className="absolute top-0 bottom-0 w-[2px] bg-white"
          style={playheadStyle}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}
