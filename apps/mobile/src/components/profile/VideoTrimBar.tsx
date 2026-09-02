import type { EditableMedia } from "@/features/profile/useHighlightComposer";
import {
  MAX_TRIM_SEGMENT_SECONDS,
  MIN_TRIM_SEGMENT_SECONDS,
} from "@/features/profile/useHighlights";
import formatDuration from "@abonten/core/formatVideoDuration";
import { AppText } from "@abonten/ui-native";
import { Image } from "expo-image";
import type { VideoPlayer, VideoThumbnail } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

// Native echo of the web `VideoTrimEditor`: a real thumbnail timeline with
// two draggable handles + a draggable selection window + a playhead synced
// to the player's own time updates. Playback loops within the selected
// range. The raw clip is never re-encoded — the [start, end] window is
// handed back up and baked into the Cloudinary delivery URL at upload
// (see resolveTrimmedDelivery in useHighlights.ts).

const HANDLE_W = 22;
const TRACK_H = 56;
const THUMB_COUNT = 8;

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
  const [thumbs, setThumbs] = useState<VideoThumbnail[]>([]);
  const [thumbsFailed, setThumbsFailed] = useState(false);

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

  // Thumbnail strip — generated once the player has a loaded source.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the clip identity
  useEffect(() => {
    let cancelled = false;
    setThumbs([]);
    setThumbsFailed(false);
    const times = Array.from(
      { length: THUMB_COUNT },
      (_, i) => (duration * (i + 0.5)) / THUMB_COUNT,
    );
    (async () => {
      try {
        // A short delay lets replaceAsync settle so the first frames decode.
        await new Promise((r) => setTimeout(r, 250));
        const out = await player.generateThumbnailsAsync(times, {
          maxHeight: 120,
        });
        if (!cancelled) setThumbs(out);
      } catch {
        if (!cancelled) setThumbsFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item.uri, duration]);

  // Playhead + loop-within-range.
  useEffect(() => {
    const sub = player.addListener("timeUpdate", (e) => {
      const { start, end } = windowRef.current;
      playX.value = xForSec(e.currentTime);
      if (e.currentTime >= end || e.currentTime < start - 0.15) {
        player.currentTime = start;
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

  const seekTo = useCallback(
    (seconds: number) => {
      player.currentTime = seconds;
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
        {/* thumbnail row (clipped to the rounded shape) */}
        <View
          className="absolute inset-0 flex-row overflow-hidden rounded-lg"
          style={{ backgroundColor: "#1a1a1a" }}
        >
          {thumbs.length > 0
            ? thumbs.map((t, i) => (
                <Image
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed positional frames
                  key={i}
                  source={t}
                  style={{ flex: 1, height: "100%" }}
                  contentFit="cover"
                />
              ))
            : !thumbsFailed
              ? Array.from({ length: THUMB_COUNT }).map((_, i) => (
                  <View
                    // biome-ignore lint/suspicious/noArrayIndexKey: placeholder cells
                    key={i}
                    style={{ flex: 1, height: "100%" }}
                    className="border-r border-white/5 bg-white/5"
                  />
                ))
              : null}
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
