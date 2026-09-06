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
//
// The drag handlers below run on the UI runtime (react-native-worklets, via
// gesture-handler). They must NOT synchronously call any function defined
// in the React render scope (e.g. a useCallback) — that throws "Tried to
// synchronously call a Remote Function". So the px→seconds conversion is
// done inline in each worklet from the captured `trackW` / `duration`
// numbers, and only the resulting number is handed to JS via runOnJS.

const HANDLE_W = 22;
const TRACK_H = 56;
const THUMB_COUNT = 6;
const THUMB_MAX_HEIGHT = 80;
// Below this the strip is skipped entirely — sampling frames from a very
// short / zero-duration source is a native crash path, not just an ugly UI.
const MIN_THUMBNAIL_DURATION = 1;
const READY_TIMEOUT_MS = 4000;
// Cap how often the drag handlers poke player.currentTime — a seek on every
// gesture frame can wedge the native player on some Android devices.
const SEEK_THROTTLE_MS = 60;

type Props = {
  player: VideoPlayer;
  item: EditableMedia;
  /** Fires continuously as the user drags. */
  onTrimChange: (startSeconds: number, endSeconds: number) => void;
  /** First timeline frame, handed up so the filmstrip cell can show a
   * poster instead of a generic video icon. Fires once per clip. */
  onPoster?: (thumb: VideoThumbnail) => void;
};

/** Resolve once the player has a genuinely playable source (or times out /
 * errors) — asking a not-yet-decoded video for thumbnails is what crashes
 * the native retriever. */
function waitForReady(
  player: VideoPlayer,
  timeoutMs: number,
): Promise<boolean> {
  if (player.status === "readyToPlay") return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (value: boolean) => {
      if (done) return;
      done = true;
      sub.remove();
      clearTimeout(timer);
      resolve(value);
    };
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") finish(true);
      else if (status === "error") finish(false);
    });
    const timer = setTimeout(
      () => finish(player.status === "readyToPlay"),
      timeoutMs,
    );
  });
}

export function VideoTrimBar({ player, item, onTrimChange, onPoster }: Props) {
  const duration = Math.max(
    item.durationSeconds ?? player.duration ?? 0,
    0.001,
  );

  const [trackW, setTrackW] = useState(0);
  const [thumbs, setThumbs] = useState<VideoThumbnail[]>([]);
  const [thumbsFailed, setThumbsFailed] = useState(false);

  // Keep the poster callback current without making it a thumbnail-effect
  // dependency (that effect is keyed on clip identity only).
  const onPosterRef = useRef(onPoster);
  onPosterRef.current = onPoster;

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

  // Thumbnail strip. Only sampled once the player reports a real playable
  // source, and only for clips long enough to sample safely — a batched
  // generateThumbnailsAsync call that lands on an undecodable frame can take
  // the native media retriever down, so frames are requested ONE AT A TIME,
  // each guarded, and the strip degrades to plain placeholder cells on the
  // first hard failure.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the clip identity
  useEffect(() => {
    let cancelled = false;
    setThumbs([]);
    setThumbsFailed(false);

    const usable =
      Number.isFinite(duration) && duration >= MIN_THUMBNAIL_DURATION
        ? duration
        : 0;
    if (usable === 0) {
      setThumbsFailed(true);
      return;
    }

    const times = Array.from(
      { length: THUMB_COUNT },
      (_, i) => (usable * (i + 0.5)) / THUMB_COUNT,
    );

    (async () => {
      const ready = await waitForReady(player, READY_TIMEOUT_MS);
      if (cancelled) return;
      if (!ready) {
        setThumbsFailed(true);
        return;
      }
      const out: VideoThumbnail[] = [];
      for (const t of times) {
        if (cancelled) return;
        try {
          const frames = await player.generateThumbnailsAsync([t], {
            maxHeight: THUMB_MAX_HEIGHT,
          });
          const frame = frames?.[0];
          if (frame) {
            out.push(frame);
            // Hand the first good frame up for the filmstrip poster.
            if (out.length === 1) onPosterRef.current?.(frame);
            if (!cancelled) setThumbs([...out]);
          }
        } catch {
          // One bad frame shouldn't blank the whole strip; keep what we
          // have. If we have nothing yet, drop to the placeholder cells.
          if (out.length === 0 && !cancelled) setThumbsFailed(true);
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [item.uri, duration]);

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
      "worklet";
      startAnchor.value = startX.value;
    })
    .onUpdate((e) => {
      "worklet";
      let nx = startAnchor.value + e.translationX;
      nx = Math.max(0, Math.min(nx, endX.value - minPx));
      if (endX.value - nx > maxPx) endX.value = nx + maxPx;
      startX.value = nx;
      const sec = trackW > 0 ? (nx / trackW) * duration : 0;
      runOnJS(seekTo)(sec);
    })
    .onEnd(() => {
      "worklet";
      runOnJS(commit)();
    });

  const endDrag = Gesture.Pan()
    .onBegin(() => {
      "worklet";
      endAnchor.value = endX.value;
    })
    .onUpdate((e) => {
      "worklet";
      let nx = endAnchor.value + e.translationX;
      nx = Math.min(trackW, Math.max(nx, startX.value + minPx));
      if (nx - startX.value > maxPx) startX.value = nx - maxPx;
      endX.value = nx;
      const sec = trackW > 0 ? (nx / trackW) * duration : 0;
      runOnJS(seekTo)(sec);
    })
    .onEnd(() => {
      "worklet";
      runOnJS(commit)();
    });

  const windowDrag = Gesture.Pan()
    .onBegin(() => {
      "worklet";
      startAnchor.value = startX.value;
      endAnchor.value = endX.value;
    })
    .onUpdate((e) => {
      "worklet";
      const span = endAnchor.value - startAnchor.value;
      let ns = startAnchor.value + e.translationX;
      ns = Math.max(0, Math.min(ns, trackW - span));
      startX.value = ns;
      endX.value = ns + span;
      const sec = trackW > 0 ? (ns / trackW) * duration : 0;
      runOnJS(seekTo)(sec);
    })
    .onEnd(() => {
      "worklet";
      runOnJS(commit)();
    });

  const selectionStyle = useAnimatedStyle(() => ({
    left: startX.value,
    width: Math.max(0, endX.value - startX.value),
  }));
  const leftMaskStyle = useAnimatedStyle(() => ({ width: startX.value }));
  const rightMaskStyle = useAnimatedStyle(() => ({
    left: endX.value,
    width: Math.max(0, trackW - endX.value),
  }));
  // Handles are drawn INSIDE the track (start handle extends right from the
  // trim-in point, end handle extends left from the trim-out point) rather
  // than overhanging its outer edges — so even at full extent the grab
  // targets never reach the screen edge, where the OS back-swipe / Android
  // predictive-back gesture would steal the drag.
  const startHandleStyle = useAnimatedStyle(() => ({ left: startX.value }));
  const endHandleStyle = useAnimatedStyle(() => ({
    left: endX.value - HANDLE_W,
  }));
  const playheadStyle = useAnimatedStyle(() => ({ left: playX.value }));

  const onLayout = (ev: LayoutChangeEvent) =>
    setTrackW(ev.nativeEvent.layout.width);

  const startSec = item.startSeconds ?? 0;
  const endSec = item.endSeconds ?? duration;

  return (
    // px-10 keeps the whole track (and the inset handles) ~40dp clear of
    // both screen edges so a trim drag can't trigger the OS back gesture.
    <View className="gap-2 px-10">
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
              : Array.from({ length: THUMB_COUNT }).map((_, i) => (
                  <View
                    // biome-ignore lint/suspicious/noArrayIndexKey: fallback cells
                    key={i}
                    style={{ flex: 1, height: "100%" }}
                    className="border-l border-white/10 bg-white/5"
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
