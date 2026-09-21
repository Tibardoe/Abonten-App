import {
  claimPlayback,
  releasePlayback,
} from "@/features/content/playback/playbackOwner";
import {
  getSpotlightMuted,
  useSpotlightMuted,
} from "@/features/content/playback/spotlightSound";
import { useIsOnline } from "@/lib/network";
import {
  type FeedPlaybackMode,
  feedVideoSources,
} from "@abonten/core/content/feedPlayback";
import type { ContentMediaItem } from "@abonten/types/contentType";
import { AppText, Icon, useReducedMotion } from "@abonten/ui-native";
import { Image } from "expo-image";
import { type BufferOptions, VideoView, useVideoPlayer } from "expo-video";
import {
  type MutableRefObject,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// One Spotlight video: poster, player and its whole lifecycle.
//
// The player belongs to this page and to nothing else. It exists only while
// the page is active or a direct neighbour (`mode`, see
// @abonten/core/content/feedPlayback): mounting <PlayerLayer> creates it and
// loads the video, unmounting releases the native decoder. A neighbour's
// video is loaded and its first frame drawn while paused, so a swipe lands
// on a real frame that starts immediately, and the poster above it only
// fades once the video underneath has drawn a frame of its own.
//
// Because every page has its own player and its own VideoView, the view is
// never re-attached to a different player and no source is ever swapped
// under a playing view — the two things behind the old frozen-frame /
// audio-over-the-wrong-video failures.

/**
 * The active page's player, as its controls see it: the clock (UI-thread
 * values the timeline animates from) and a seek. Only the ACTIVE page's
 * player drives it, so a neighbour preloading in the background can never
 * move the timeline or be seeked by it.
 */
export type SpotlightPlayback = {
  /** Current position in seconds. */
  time: SharedValue<number>;
  /** Length in seconds; 0 until the player knows it. */
  duration: SharedValue<number>;
  /** Filled in while this page's player is active. */
  seek: MutableRefObject<((seconds: number) => void) | null>;
};

type Props = {
  media: ContentMediaItem;
  mode: FeedPlaybackMode;
  shouldPlay: boolean;
  posterUri: string | null;
  recyclingKey: string;
  /** Playback rate while active (the chosen speed, or the hold boost). */
  rate?: number;
  playback?: SpotlightPlayback;
  /**
   * The active video is waiting on data it should be playing — the first
   * load or a buffer refill — for longer than a blink. Straight from the
   * player's own status, never a timer standing in for it.
   */
  onWaitingChange?: (waiting: boolean) => void;
  onPlayingChange?: (playing: boolean) => void;
  /** The clip wrapped around to its start (telemetry: completion + replay). */
  onLoop?: () => void;
};

export const SpotlightVideo = memo(function SpotlightVideo({
  media,
  mode,
  shouldPlay,
  posterUri,
  recyclingKey,
  rate = 1,
  playback,
  onWaitingChange,
  onPlayingChange,
  onLoop,
}: Props) {
  const reduceMotion = useReducedMotion();
  const posterOpacity = useSharedValue(1);
  const [frameShown, setFrameShown] = useState(false);
  const wantPlayer = mode !== "idle";

  // Player lifetime, with an ORDERED teardown. Unmounting a VideoView while
  // its player's decoder is still writing frames into the view's texture
  // crashed the app on Android (a native abort on the MediaCodec thread:
  // the TextureView's surface was destroyed under a frame in flight) when
  // scrolling fast. So a page leaving the window first unloads its video
  // ("retiring": pause, then replace the source with nothing, which stops
  // the decoder), and only then unmounts the view and releases the player.
  // If the page comes back while retiring, it gets a fresh player after.
  const [layer, setLayer] = useState<"none" | "live" | "retiring">(
    wantPlayer ? "live" : "none",
  );
  const [layerKey, setLayerKey] = useState(0);
  const revive = useRef(false);
  useEffect(() => {
    if (wantPlayer) {
      if (layer === "none") setLayer("live");
      else if (layer === "retiring") revive.current = true;
    } else {
      revive.current = false;
      if (layer === "live") setLayer("retiring");
    }
  }, [wantPlayer, layer]);
  const onRetired = useCallback(() => {
    if (revive.current) {
      revive.current = false;
      setLayerKey((k) => k + 1);
      setLayer("live");
    } else {
      setLayer("none");
    }
  }, []);

  // No live player → the poster is all there is; show it at full strength.
  useEffect(() => {
    if (layer !== "live") {
      setFrameShown(false);
      posterOpacity.value = 1;
    }
  }, [layer, posterOpacity]);

  const onFrame = useCallback(
    (shown: boolean) => {
      setFrameShown(shown);
      posterOpacity.value = shown
        ? reduceMotion
          ? 0
          : withTiming(0, { duration: 140 })
        : 1;
    },
    [posterOpacity, reduceMotion],
  );

  const posterStyle = useAnimatedStyle(() => ({
    opacity: posterOpacity.value,
  }));

  // The live player's load state, lifted here so the "couldn't play" /
  // "you're offline" notice is drawn ABOVE the poster. The poster covers the
  // player until the first frame — exactly the moment a failed load needs to
  // be seen — so a notice inside the player layer was hidden under it
  // (found on the emulator: readable by a screen reader, invisible on screen).
  const online = useIsOnline();
  const [load, setLoad] = useState<LoadState>("loading");
  const retryRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (layer !== "live") setLoad("loading");
  }, [layer]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {layer !== "none" ? (
        <PlayerLayer
          key={layerKey}
          media={media}
          active={mode === "active" && layer === "live"}
          shouldPlay={shouldPlay && layer === "live"}
          retiring={layer === "retiring"}
          onRetired={onRetired}
          onFrame={onFrame}
          frameShown={frameShown}
          rate={rate}
          playback={playback}
          onWaitingChange={onWaitingChange}
          onPlayingChange={onPlayingChange}
          onLoop={onLoop}
          onLoadState={setLoad}
          retryRef={retryRef}
        />
      ) : null}
      {posterUri ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, posterStyle]}
        >
          <Image
            source={{ uri: posterUri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={recyclingKey}
          />
        </Animated.View>
      ) : null}
      {mode === "active" && layer === "live" && load === "error" ? (
        <LoadNotice online={online} onRetry={() => retryRef.current?.()} />
      ) : null}
    </View>
  );
});

/** Why the active clip is not playing, over the poster; a tap retries. */
function LoadNotice({
  online,
  onRetry,
}: {
  online: boolean;
  onRetry: () => void;
}) {
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.center]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry video"
        className="items-center gap-2 rounded-2xl bg-black/60 px-5 py-4"
      >
        <Icon
          name={online ? "refresh" : "cloud-offline-outline"}
          size={26}
          color="#fff"
        />
        <AppText className="text-center text-[14px] font-semibold text-white">
          {online ? "Couldn't play this video" : "You're offline"}
        </AppText>
        <AppText className="text-center text-[12px] text-white/75">
          {online ? "Tap to try again" : "It will play when you're back online"}
        </AppText>
      </Pressable>
    </View>
  );
}

type LoadState = "loading" | "ready" | "error";

const MB = 1024 * 1024;
const ACTIVE_BUFFER: BufferOptions = {
  preferredForwardBufferDuration: 12,
  minBufferForPlayback: 1,
  maxBufferBytes: 12 * MB,
};
const PRELOAD_BUFFER: BufferOptions = {
  preferredForwardBufferDuration: 3,
  minBufferForPlayback: 1,
  maxBufferBytes: 3 * MB,
};

function PlayerLayer({
  media,
  active,
  shouldPlay,
  retiring,
  onRetired,
  onFrame,
  frameShown,
  rate,
  playback,
  onWaitingChange,
  onPlayingChange,
  onLoop,
  onLoadState,
  retryRef,
}: {
  media: ContentMediaItem;
  active: boolean;
  shouldPlay: boolean;
  /** Unload the video; call onRetired once the decoder has stopped. */
  retiring: boolean;
  onRetired: () => void;
  onFrame: (shown: boolean) => void;
  frameShown: boolean;
  rate: number;
  playback?: SpotlightPlayback;
  onWaitingChange?: (waiting: boolean) => void;
  onPlayingChange?: (playing: boolean) => void;
  onLoop?: () => void;
  /** The load state, for the notice the parent draws above the poster. */
  onLoadState: (load: LoadState) => void;
  retryRef: MutableRefObject<(() => void) | null>;
}) {
  const muted = useSpotlightMuted();
  const online = useIsOnline();
  const { primary, fallback } = feedVideoSources(media);
  // The optimised rendition failed to load: play the original upload. The
  // source changes, so useVideoPlayer creates a fresh player for it.
  const [onFallback, setOnFallback] = useState(false);
  const uri = onFallback && fallback ? fallback : primary;

  // `useCaching` keeps played bytes on disk, so scrolling back to a video
  // (or replaying it offline) does not download it again.
  const player = useVideoPlayer(uri ? { uri, useCaching: true } : null, (p) => {
    p.loop = true;
    p.muted = getSpotlightMuted();
    p.audioMixingMode = p.muted ? "mixWithOthers" : "auto";
    p.timeUpdateEventInterval = 0.25;
    p.keepScreenOnWhilePlaying = true;
    p.bufferOptions = active ? ACTIVE_BUFFER : PRELOAD_BUFFER;
    // Faster or slower playback keeps voices at their own pitch.
    p.preservesPitch = true;
  });

  // Buffer caps. ExoPlayer's defaults size a video buffer for long-form
  // playback (tens of MB, held in the Java heap); with a player per page
  // that exhausted the heap during long scrolling sessions (measured: an
  // OutOfMemoryError after ~30 fast swipes on a debug build). A neighbour
  // only needs enough to start instantly; the active page enough to ride
  // out a slow network for a few seconds of a short clip.
  useEffect(() => {
    try {
      player.bufferOptions = active ? ACTIVE_BUFFER : PRELOAD_BUFFER;
    } catch {}
  }, [active, player]);

  const [load, setLoad] = useState<LoadState>("loading");
  const [buffering, setBuffering] = useState(false);
  useEffect(() => {
    onLoadState(load);
  }, [load, onLoadState]);
  const callbacks = useRef({ onPlayingChange, onLoop, onFrame });
  callbacks.current = { onPlayingChange, onLoop, onFrame };

  // Every listener is scoped to THIS player, so an event from another page's
  // player (or one fired while this one is being released) cannot reach it.
  useEffect(() => {
    setLoad("loading");
    callbacks.current.onFrame(false);
    let lastTime = 0;
    let advanced = false;
    const subs = [
      player.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay") {
          setLoad("ready");
          setBuffering(false);
        } else if (status === "loading") {
          setBuffering(true);
        } else if (status === "error") {
          setBuffering(false);
          if (fallback && !onFallback) setOnFallback(true);
          else setLoad("error");
        }
      }),
      player.addListener("playingChange", ({ isPlaying }) => {
        if (isPlaying) setBuffering(false);
        callbacks.current.onPlayingChange?.(isPlaying);
      }),
      player.addListener("timeUpdate", ({ currentTime }) => {
        // A fresh player can report a spurious wrap at 0:00 before playing;
        // only a clip that has actually advanced can loop.
        if (currentTime > 0.15) advanced = true;
        if (advanced && currentTime + 0.5 < lastTime) {
          callbacks.current.onLoop?.();
        }
        lastTime = currentTime;
      }),
    ];
    return () => {
      for (const s of subs) {
        try {
          s.remove();
        } catch {}
      }
      releasePlayback(player);
    };
  }, [player, fallback, onFallback]);

  // The timeline's clock and seek belong to the ACTIVE player only. Each
  // timeUpdate (every 0.25 s) sets the target and the UI thread glides
  // there linearly while playing, so the bar moves smoothly without a
  // JS-side animation loop.
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  useEffect(() => {
    const pb = playbackRef.current;
    if (!active || !pb) return;
    pb.time.value = 0;
    pb.duration.value = 0;
    const sync = (currentTime: number) => {
      const d = player.duration;
      if (Number.isFinite(d) && d > 0) pb.duration.value = d;
      const jump = Math.abs(currentTime - pb.time.value) > 0.6;
      pb.time.value =
        jump || !player.playing
          ? currentTime
          : withTiming(currentTime, {
              duration: 250,
              easing: Easing.linear,
            });
    };
    const sub = player.addListener("timeUpdate", ({ currentTime }) =>
      sync(currentTime),
    );
    const seek = (seconds: number) => {
      try {
        player.currentTime = seconds;
        pb.time.value = seconds;
      } catch {
        // Released between the gesture and the seek.
      }
    };
    pb.seek.current = seek;
    return () => {
      sub.remove();
      if (pb.seek.current === seek) pb.seek.current = null;
    };
  }, [active, player]);

  // Speed applies to the active page only; a neighbour waits at 1×.
  useEffect(() => {
    try {
      player.playbackRate = active ? rate : 1;
    } catch {}
  }, [active, rate, player]);

  // Some Android surfaces never report the first frame for a TextureView
  // that was just attached; once the clip is really advancing, the frame on
  // screen is this video's, so the poster may go.
  useEffect(() => {
    if (frameShown || !shouldPlay) return;
    const sub = player.addListener("timeUpdate", ({ currentTime }) => {
      if (currentTime > 0.2) callbacks.current.onFrame(true);
    });
    return () => sub.remove();
  }, [player, frameShown, shouldPlay]);

  // Retirement: stop, then unload, so nothing renders into the view's
  // surface when it is torn down. Unload failing (already released) is
  // retirement too.
  const onRetiredRef = useRef(onRetired);
  onRetiredRef.current = onRetired;
  useEffect(() => {
    if (!retiring) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onRetiredRef.current();
    };
    try {
      player.pause();
    } catch {}
    releasePlayback(player);
    player.replaceAsync(null).then(finish, finish);
    // Never let a stuck unload keep a page (and its decoder) around.
    const t = setTimeout(finish, 1500);
    return () => clearTimeout(t);
  }, [retiring, player]);

  // Play / pause. The only place this player starts, and it takes audio
  // ownership in the same synchronous call.
  useEffect(() => {
    try {
      if (shouldPlay) {
        claimPlayback(player);
        player.play();
      } else {
        player.pause();
      }
    } catch {
      // Released between render and effect.
    }
  }, [shouldPlay, player]);

  // Leaving the active slot rewinds, so coming back starts from the top and
  // a neighbour always waits on its first frame.
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) {
      try {
        player.currentTime = 0;
      } catch {}
    }
    wasActive.current = active;
  }, [active, player]);

  useEffect(() => {
    try {
      player.muted = muted;
      // Muted autoplay must not stop the person's own music.
      player.audioMixingMode = muted ? "mixWithOthers" : "auto";
    } catch {}
  }, [muted, player]);

  const retry = useCallback(() => {
    if (!uri) return;
    setLoad("loading");
    player.replaceAsync({ uri, useCaching: true }).catch(() => {
      setLoad("error");
    });
  }, [player, uri]);

  useEffect(() => {
    retryRef.current = retry;
    return () => {
      if (retryRef.current === retry) retryRef.current = null;
    };
  }, [retry, retryRef]);

  // Connection back after a failed load: try again once, on the event
  // that makes success possible — not on a timer.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current && load === "error") retry();
    wasOnline.current = online;
  }, [online, load, retry]);

  // A short grace period so quick buffer refills don't flash a spinner.
  const [showSpinner, setShowSpinner] = useState(false);
  const waiting =
    shouldPlay && load !== "error" && (load === "loading" || buffering);
  useEffect(() => {
    if (!waiting) {
      setShowSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowSpinner(true), 350);
    return () => clearTimeout(t);
  }, [waiting]);

  // The card draws the loading bar (at the foot of the video, clear of the
  // controls); this page only reports while it is the active one.
  const reportWaiting = active && showSpinner;
  const onWaitingRef = useRef(onWaitingChange);
  onWaitingRef.current = onWaitingChange;
  useEffect(() => {
    onWaitingRef.current?.(reportWaiting);
  }, [reportWaiting]);
  useEffect(() => () => onWaitingRef.current?.(false), []);

  return (
    <>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture={false}
        // Android: a SurfaceView is composited outside the view tree, so it
        // ignores the comments shrink transform and draws over siblings.
        surfaceType="textureView"
        onFirstFrameRender={() => callbacks.current.onFrame(true)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
});
