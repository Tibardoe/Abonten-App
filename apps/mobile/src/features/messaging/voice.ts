import type { SendMessageAttachmentInput } from "@abonten/types/messagingType";
import {
  AudioModule,
  RecordingPresets,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { AttachmentPermissionError, uploadChatAttachment } from "./attachments";

// Voice-note recording, built on expo-audio (the SDK 54+ unified audio API).
//
// The composer drives this: hold the mic → `start()`, release → `stop()` and
// send, drag away → `cancel()`. Recordings land in the app cache as `.m4a`
// (RecordingPresets.HIGH_QUALITY) and upload to the same private
// message-attachments bucket as photos, then send as an `audio` message —
// the outbox / reconcile / retry path is shared with every other attachment.
//
// expo-audio's AudioRecorder is a native "shared object". Any call on it
// after `useAudioRecorder`'s own teardown throws
// ("Cannot use shared object that was already released") and, for `stop()`,
// as an UNHANDLED promise rejection. So: every `recorder.*` access is
// guarded, every `stop()` promise is `.catch()`ed, and a `startedRef`
// (plain JS) — not the native `recorder.isRecording` — decides whether
// there is anything to stop.

export const VOICE_MAX_DURATION_MS = 5 * 60_000;
export const VOICE_MIN_DURATION_MS = 900;
const VOICE_MIME = "audio/m4a";
const METER_SAMPLE_CAP = 44;

export type VoiceRecorderPhase =
  | "idle"
  | "requesting"
  | "recording"
  | "locked"
  | "stopping";

export type VoiceRecording = {
  uri: string;
  durationSeconds: number;
};

export type VoiceStartResult =
  | "started"
  | "permission-requested" // OS prompt was shown — hold again to record
  | "denied";

function meterToLevel(db: number | undefined): number {
  if (db == null || Number.isNaN(db)) return 0;
  // expo-audio reports roughly -60 (near silence) .. 0 (loudest) dB.
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

export function useVoiceRecorder() {
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });

  const [phase, setPhase] = useState<VoiceRecorderPhase>("idle");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [samples, setSamples] = useState<number[]>([]);
  const startedAtRef = useRef(0);
  // True from a successful `recorder.record()` until any stop/cancel. The
  // ONLY thing that authorises a `recorder.stop()` call.
  const startedRef = useRef(false);
  // JS mirror of `phase` for the unmount cleanup (touching `recorder` there
  // throws).
  const phaseRef = useRef<VoiceRecorderPhase>("idle");
  phaseRef.current = phase;

  const active = phase === "recording" || phase === "locked";
  // expo-audio's useAudioRecorderState captures its poll interval ONCE (its
  // internal effect only depends on `recorder.id`), so a *variable* interval
  // is silently ignored — whatever value it first saw wins forever. Passing a
  // slow idle interval therefore froze metering + duration at 0 for the whole
  // recording. Poll at a constant cheap rate instead, and take the duration
  // from the wall clock — native `durationMillis` does not tick on every
  // device / in Expo Go.
  const recorderState = useAudioRecorderState(recorder, 100);
  const level = meterToLevel(recorderState.metering);
  const levelRef = useRef(0);
  levelRef.current = level;

  // A local ticker owns both the timer and the waveform feed, so they advance
  // ~11×/s no matter what the native status reports: the wall clock for the
  // duration, real metering for the bars when the platform provides it, and a
  // gentle synthetic level otherwise so the bar is never a dead flat line
  // (metering is unavailable on some Android devices and in Expo Go).
  const [durationMs, setDurationMs] = useState(0);
  useEffect(() => {
    if (!active) {
      setDurationMs(0);
      return;
    }
    const id = setInterval(() => {
      setDurationMs(Date.now() - startedAtRef.current);
      setSamples((prev) => {
        const l = levelRef.current;
        const v = l > 0.03 ? l : 0.12 + Math.random() * 0.42;
        const next = [...prev, v];
        return next.length > METER_SAMPLE_CAP
          ? next.slice(next.length - METER_SAMPLE_CAP)
          : next;
      });
    }, 90);
    return () => clearInterval(id);
  }, [active]);

  const resetAudioMode = useCallback(async () => {
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      // best effort
    }
  }, []);

  // Fire a stop at the native recorder at most once, swallowing any
  // rejection / released-object error.
  const safeStop = useCallback(async (): Promise<void> => {
    if (!startedRef.current) return;
    startedRef.current = false;
    try {
      await recorder.stop();
    } catch {
      // already released / never really started
    }
  }, [recorder]);

  const cancel = useCallback(async () => {
    setPhase("idle");
    setSamples([]);
    await safeStop();
    await resetAudioMode();
  }, [safeStop, resetAudioMode]);

  const start = useCallback(async (): Promise<VoiceStartResult> => {
    if (phaseRef.current !== "idle") return "started";
    setPhase("requesting");

    // Check first so a first-time hold only grants permission (the OS dialog
    // cancels the touch gesture anyway) — the user then holds again to
    // actually record.
    let status = await getRecordingPermissionsAsync().catch(() => null);
    let prompted = false;
    if (!status?.granted) {
      prompted = true;
      status = await AudioModule.requestRecordingPermissionsAsync().catch(
        () => null,
      );
    }
    if (!status?.granted) {
      setPermissionDenied(true);
      setPhase("idle");
      if (prompted) return "denied";
      throw new AttachmentPermissionError(
        "Microphone access is needed to record a voice message.",
      );
    }
    setPermissionDenied(false);
    if (prompted) {
      setPhase("idle");
      return "permission-requested";
    }

    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      startedRef.current = true;
      startedAtRef.current = Date.now();
      setSamples([]);
      setPhase("recording");
      return "started";
    } catch (e) {
      setPhase("idle");
      await resetAudioMode();
      throw e instanceof Error
        ? e
        : new Error("Couldn't start recording. Please try again.");
    }
  }, [recorder, resetAudioMode]);

  const lock = useCallback(() => {
    setPhase((p) => (p === "recording" ? "locked" : p));
  }, []);

  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    if (phaseRef.current !== "recording" && phaseRef.current !== "locked") {
      await cancel();
      return null;
    }
    setPhase("stopping");
    // Wall clock — native `durationMillis` is unreliable (see the note above).
    const elapsed = Date.now() - startedAtRef.current;

    let uri: string | null = null;
    if (startedRef.current) {
      startedRef.current = false;
      try {
        await recorder.stop();
        uri = recorder.uri ?? null;
      } catch {
        uri = null;
      }
    }

    setPhase("idle");
    setSamples([]);
    await resetAudioMode();

    if (!uri || elapsed < VOICE_MIN_DURATION_MS) return null;
    return { uri, durationSeconds: Math.max(1, Math.round(elapsed / 1000)) };
  }, [cancel, recorder, resetAudioMode]);

  // Auto-stop at the ceiling; the caller decides whether to send what we got.
  const autoStoppedRef = useRef(false);
  useEffect(() => {
    if (
      active &&
      durationMs >= VOICE_MAX_DURATION_MS &&
      !autoStoppedRef.current
    ) {
      autoStoppedRef.current = true;
      void safeStop();
      setPhase("locked");
    }
    if (!active) autoStoppedRef.current = false;
  }, [active, durationMs, safeStop]);

  // Screen unmounting mid-record: stop the native recorder (promise handled)
  // and drop the record audio session. `useAudioRecorder` also releases the
  // object here, so this is best-effort only.
  useEffect(() => {
    return () => {
      if (startedRef.current) {
        startedRef.current = false;
        recorder.stop().catch(() => {});
      }
      setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    };
  }, [recorder]);

  return {
    phase,
    isActive: active,
    isLocked: phase === "locked",
    durationMs,
    samples,
    level,
    permissionDenied,
    start,
    stop,
    cancel,
    lock,
  };
}

// Upload a finished recording and return the attachment descriptor. Throws a
// friendly error if the file came back empty (common on an emulator with no
// working microphone).
export async function uploadVoiceNote(
  conversationId: string,
  recording: VoiceRecording,
): Promise<SendMessageAttachmentInput> {
  return uploadChatAttachment(conversationId, {
    uri: recording.uri,
    kind: "audio",
    mimeType: VOICE_MIME,
    fileName: "voice-message.m4a",
    durationSeconds: recording.durationSeconds,
  });
}
