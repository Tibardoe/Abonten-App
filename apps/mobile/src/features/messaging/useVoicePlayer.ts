import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAttachmentUrl } from "./useAttachmentUrl";

// Force the audio session into a playback route before starting a clip. After
// recording, iOS leaves the session in `.playAndRecord`, which routes to the
// quiet earpiece receiver — so a voice note is inaudible on the phone speaker
// unless a headset is connected. `allowsRecording: false` reverts the
// category to `.playback` (speaker); `shouldRouteThroughEarpiece: false` is
// belt-and-braces; `playsInSilentMode` keeps a deliberately-tapped voice
// note audible with the ring switch on, like WhatsApp.
async function ensurePlaybackRoute(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // best effort — playback still works, just possibly on the wrong route
  }
}

// Cross-bubble coordination: only one voice note plays at a time. Starting
// one pauses whichever was playing (task §7). A tiny module-level pub/sub —
// no context provider needed, and it survives individual bubbles unmounting
// as the list recycles rows.

let activeId: string | null = null;
const listeners = new Set<() => void>();

function setActiveVoice(id: string | null): void {
  activeId = id;
  for (const l of listeners) l();
}

function useIsActiveVoice(id: string): boolean {
  const [isActive, setIsActive] = useState(() => activeId === id);
  useEffect(() => {
    const l = () => setIsActive(activeId === id);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
      // If this bubble scrolled off while it held the slot, free it.
      if (activeId === id) setActiveVoice(null);
    };
  }, [id]);
  return isActive;
}

export type VoiceBubblePlayer = {
  /** null while the private URL is still being signed. */
  ready: boolean;
  loadFailed: boolean;
  playing: boolean;
  /** 0..1 through the clip. */
  progress: number;
  /** seconds elapsed / total. */
  positionSeconds: number;
  durationSeconds: number;
  toggle: () => void;
  seekToFraction: (f: number) => void;
};

// Everything a VoiceMessageBubble needs: sign the private storage path,
// drive an expo-audio player, keep only one playing app-wide, and pause on
// background.
export function useVoiceBubblePlayer(
  messageId: string,
  storagePath: string | null | undefined,
  fallbackDurationSeconds: number | null | undefined,
): VoiceBubblePlayer {
  // Lazy: a long thread can hold dozens of voice notes — don't sign a URL
  // or load native audio for any of them until the reader taps play once.
  const [armed, setArmed] = useState(false);
  const wantPlayRef = useRef(false);

  const signed = useAttachmentUrl(armed ? storagePath : null);
  const url = signed.data ?? null;
  // Stable source object so the player isn't recreated on every render.
  const source = useMemo(() => (url ? { uri: url } : null), [url]);
  const player = useAudioPlayer(source, { updateInterval: 120 });
  const status = useAudioPlayerStatus(player);
  const isActive = useIsActiveVoice(messageId);

  // Once the freshly-armed URL loads, honour the tap that armed it.
  useEffect(() => {
    if (url && wantPlayRef.current) {
      wantPlayRef.current = false;
      setActiveVoice(messageId);
      void ensurePlaybackRoute().then(() => player.play());
    }
  }, [url, player, messageId]);

  // Something else claimed the audio slot — stop here.
  useEffect(() => {
    if (!isActive && status.playing) player.pause();
  }, [isActive, status.playing, player]);

  // Pause when the app leaves the foreground; free resources on unmount is
  // handled by useAudioPlayer itself.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active" && player.playing) {
        player.pause();
        if (activeId === messageId) setActiveVoice(null);
      }
    });
    return () => sub.remove();
  }, [player, messageId]);

  // Restart from the top once a clip finishes.
  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
      if (activeId === messageId) setActiveVoice(null);
    }
  }, [status.didJustFinish, player, messageId]);

  const duration =
    status.duration && status.duration > 0
      ? status.duration
      : (fallbackDurationSeconds ?? 0);
  const position = Math.min(
    status.currentTime ?? 0,
    duration || Number.POSITIVE_INFINITY,
  );

  const toggle = useCallback(() => {
    if (status.playing) {
      player.pause();
      if (activeId === messageId) setActiveVoice(null);
      return;
    }
    if (!armed) {
      // First tap: sign + load, then the effect above starts playback.
      wantPlayRef.current = true;
      setArmed(true);
      return;
    }
    if (!url) return; // still loading
    setActiveVoice(messageId);
    void ensurePlaybackRoute().then(() => player.play());
  }, [status.playing, player, messageId, armed, url]);

  const seekToFraction = useCallback(
    (f: number) => {
      if (!duration) return;
      player.seekTo(Math.max(0, Math.min(1, f)) * duration);
    },
    [player, duration],
  );

  return {
    // Show the play affordance right away; only spin once armed + loading.
    ready: !armed || !!url,
    loadFailed: signed.isError || !!status.error,
    playing: status.playing,
    progress: duration ? position / duration : 0,
    positionSeconds: position,
    durationSeconds: duration,
    toggle,
    seekToFraction,
  };
}
