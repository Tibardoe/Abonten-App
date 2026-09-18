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
import { VideoView, useVideoPlayer } from "expo-video";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, {
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

type Props = {
  media: ContentMediaItem;
  mode: FeedPlaybackMode;
  shouldPlay: boolean;
  posterUri: string | null;
  recyclingKey: string;
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
  onPlayingChange,
  onLoop,
}: Props) {
  const reduceMotion = useReducedMotion();
  const posterOpacity = useSharedValue(1);
  const [frameShown, setFrameShown] = useState(false);
  const hasPlayer = mode !== "idle";

  // No player → the poster is all there is; show it at full strength.
  useEffect(() => {
    if (!hasPlayer) {
      setFrameShown(false);
      posterOpacity.value = 1;
    }
  }, [hasPlayer, posterOpacity]);

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

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {hasPlayer ? (
        <PlayerLayer
          media={media}
          active={mode === "active"}
          shouldPlay={shouldPlay}
          onFrame={onFrame}
          frameShown={frameShown}
          onPlayingChange={onPlayingChange}
          onLoop={onLoop}
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
    </View>
  );
});

type LoadState = "loading" | "ready" | "error";

function PlayerLayer({
  media,
  active,
  shouldPlay,
  onFrame,
  frameShown,
  onPlayingChange,
  onLoop,
}: {
  media: ContentMediaItem;
  active: boolean;
  shouldPlay: boolean;
  onFrame: (shown: boolean) => void;
  frameShown: boolean;
  onPlayingChange?: (playing: boolean) => void;
  onLoop?: () => void;
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
  });

  const [load, setLoad] = useState<LoadState>("loading");
  const [buffering, setBuffering] = useState(false);
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
      {active && showSpinner ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.center]}
          accessibilityLabel="Loading video"
        >
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
      {active && load === "error" ? (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Pressable
            onPress={retry}
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
              {online
                ? "Tap to try again"
                : "It will play when you're back online"}
            </AppText>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
});
