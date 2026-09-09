import { useCallback, useMemo, useRef, useState } from "react";

// One shared state machine for "the app is sending a file somewhere".
//
// Every create/edit flow in the app uploads at least one image, and until
// now all of them showed the same thing while it happened: nothing, or a
// spinner. On a slow Ghanaian mobile connection a 4MB flyer is a 20-40
// second wait, and a spinner cannot tell you whether it is 5% or 95% done —
// so people tap Publish again, or back out believing the app has hung.
//
// The phases here map to what the user can actually observe:
//   preparing  — a picked/cropped file is being read, no bytes on the wire
//                yet (indeterminate; we genuinely do not know how long)
//   uploading  — real bytes, real fraction, from XHR upload progress
//   saving     — the file landed, the row is being written server-side
//                (indeterminate; the server does not stream progress)
//   done/failed
//
// `saving` exists so the bar does not sit frozen at 100% while the API call
// that follows the upload runs — that pause was reading as a hang.

export type UploadPhase =
  | "idle"
  | "preparing"
  | "uploading"
  | "saving"
  | "done"
  | "failed";

export type UploadProgressState = {
  phase: UploadPhase;
  /** 0..1, only meaningful in the "uploading" phase. */
  fraction: number;
  /** true while anything is in flight — the value to disable a submit on. */
  busy: boolean;
  /** Pass to `uploadToCloudinary`'s `onProgress` (or a mutation that forwards it). */
  onProgress: (fraction: number) => void;
  setPhase: (phase: UploadPhase) => void;
  /** preparing -> (onProgress drives uploading) */
  start: () => void;
  /** Bytes are in; the server-side write is now running. */
  finishUpload: () => void;
  reset: () => void;
};

export function useUploadProgress(): UploadProgressState {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [fraction, setFraction] = useState(0);
  // Progress events arrive far faster than the screen can usefully repaint;
  // rounding to whole percent collapses a few hundred setState calls per
  // upload into at most 100, which keeps the JS thread free for the upload
  // itself.
  const lastPercent = useRef(-1);

  const onProgress = useCallback((f: number) => {
    const percent = Math.round(f * 100);
    if (percent === lastPercent.current) return;
    lastPercent.current = percent;
    setFraction(percent / 100);
    setPhase((p) => (p === "uploading" ? p : "uploading"));
  }, []);

  const start = useCallback(() => {
    lastPercent.current = -1;
    setFraction(0);
    setPhase("preparing");
  }, []);

  const finishUpload = useCallback(() => setPhase("saving"), []);

  const reset = useCallback(() => {
    lastPercent.current = -1;
    setFraction(0);
    setPhase("idle");
  }, []);

  return useMemo(
    () => ({
      phase,
      fraction,
      busy:
        phase === "preparing" || phase === "uploading" || phase === "saving",
      onProgress,
      setPhase,
      start,
      finishUpload,
      reset,
    }),
    [phase, fraction, onProgress, start, finishUpload, reset],
  );
}
