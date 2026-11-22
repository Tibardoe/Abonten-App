"use client";

import { Button } from "@/components/ui";
import { formatFileSize } from "@abonten/core/i18n/format";
import {
  REEL_FPS,
  REEL_MAX_MS,
  REEL_MIME_TYPES,
  REEL_SIZE,
  reelFileExtension,
  reelFrameAt,
  reelTimeline,
} from "@abonten/core/social/roundupReel";
import type {
  SocialQueueImage,
  SocialQueueReel,
} from "@abonten/types/socialQueueType";
import { Clapperboard, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { imageSrc } from "./imageSrc";

// "Make video (Reel / TikTok)" on a roundup (docs/admin/social.md): a
// vertical 1080×1920 slideshow of the roundup's own pictures — the cover,
// then each event's Story picture — drawn on a canvas and recorded with the
// browser's MediaRecorder, in real time (a 28-second video takes 28 seconds).
// Nothing leaves the browser: the pictures come from the console's own
// /social/image (same origin, so the canvas stays readable) and the file is
// offered for download. No sound: the founder adds a trending sound in
// Instagram or TikTok. Instagram takes MP4, which recent Chrome and Safari
// record; other browsers make WebM.

const W = REEL_SIZE.width;
const H = REEL_SIZE.height;
const BACKDROP = "#0f0f12";
/** Pictures fetched at once: each may be drawn by the website on demand. */
const LOAD_AT_ONCE = 3;
const BITS_PER_SECOND = 8_000_000;
/** How long the last picture is held past the timeline. */
const TAIL_MS = 600;

type Made = {
  url: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  seconds: number;
  skipped: number;
};

type Phase =
  | { kind: "idle"; note?: string }
  | { kind: "loading"; done: number; total: number }
  | { kind: "recording"; ms: number; totalMs: number }
  | { kind: "done"; made: Made }
  | { kind: "failed"; message: string };

type Picture = HTMLImageElement | HTMLCanvasElement;

function recordingType(): string | null {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
  ) {
    return null;
  }
  return REEL_MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

function sizeOf(p: Picture): [number, number] {
  return p instanceof HTMLImageElement
    ? [p.naturalWidth, p.naturalHeight]
    : [p.width, p.height];
}

/** Fill the whole canvas, cropping what overflows (object-fit: cover). */
function drawFill(ctx: CanvasRenderingContext2D, p: Picture) {
  const [w, h] = sizeOf(p);
  if (!w || !h) return;
  const scale = Math.max(W / w, H / h);
  const dw = w * scale;
  const dh = h * scale;
  ctx.drawImage(p, (W - dw) / 2, (H - dh) / 2, dw, dh);
}

/**
 * The 4:5 cover on a 9:16 frame: whole and centred, over a blurred,
 * darkened copy of itself (plain dark where the browser cannot blur).
 */
function coverFrame(cover: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = BACKDROP;
  ctx.fillRect(0, 0, W, H);
  if ("filter" in ctx) {
    ctx.filter = "blur(48px)";
    drawFill(ctx, cover);
    ctx.filter = "none";
  }
  ctx.fillStyle = "rgba(15, 15, 18, 0.6)";
  ctx.fillRect(0, 0, W, H);
  const [w, h] = sizeOf(cover);
  const scale = Math.min(W / w, H / h);
  const dw = w * scale;
  const dh = h * scale;
  ctx.drawImage(cover, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return canvas;
}

async function loadPicture(image: SocialQueueImage): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = imageSrc(image);
  // Rejects when the picture does not load (no longer public, too slow).
  await img.decode();
  return img;
}

/** Every frame's picture, a few at a time; null where one failed. */
async function loadPictures(
  frames: SocialQueueImage[],
  cancelled: () => boolean,
  onLoaded: (done: number) => void,
): Promise<(HTMLImageElement | null)[]> {
  const out: (HTMLImageElement | null)[] = frames.map(() => null);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < frames.length && !cancelled()) {
      const i = next++;
      out[i] = await loadPicture(frames[i]).catch(() => null);
      done += 1;
      onLoaded(done);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(LOAD_AT_ONCE, frames.length) }, worker),
  );
  return out;
}

export function RoundupReelMaker({ reel }: { reel: SocialQueueReel }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runRef = useRef<{ cancelled: boolean } | null>(null);
  const madeUrl = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(recordingType() !== null);
    return () => {
      if (runRef.current) runRef.current.cancelled = true;
      if (madeUrl.current) URL.revokeObjectURL(madeUrl.current);
    };
  }, []);

  const busy = phase.kind === "loading" || phase.kind === "recording";

  const cancel = () => {
    if (runRef.current) runRef.current.cancelled = true;
    setPhase({ kind: "idle", note: "Cancelled. Nothing was saved." });
  };

  const make = async () => {
    const mimeType = recordingType();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!mimeType || !canvas || !ctx) {
      setPhase({
        kind: "failed",
        message:
          "This browser can't record video. Use a recent Chrome or Safari.",
      });
      return;
    }
    if (madeUrl.current) {
      URL.revokeObjectURL(madeUrl.current);
      madeUrl.current = null;
    }
    const run = { cancelled: false };
    runRef.current = run;
    const isCancelled = () => run.cancelled;

    setPhase({ kind: "loading", done: 0, total: reel.frames.length });
    const pictures = await loadPictures(reel.frames, isCancelled, (done) => {
      if (!run.cancelled) {
        setPhase({ kind: "loading", done, total: reel.frames.length });
      }
    });
    if (run.cancelled) return;
    const [cover, ...events] = pictures;
    if (!cover) {
      setPhase({
        kind: "failed",
        message:
          "The cover picture didn't load, so there is no video. Try again in a minute.",
      });
      return;
    }
    const loaded = events.filter((p): p is HTMLImageElement => p !== null);
    const skipped = events.length - loaded.length;
    const slides: Picture[] = [coverFrame(cover), ...loaded];
    const timeline = reelTimeline(slides.length);

    canvas.width = W;
    canvas.height = H;
    const paint = (ms: number) => {
      const { index, next, mix } = reelFrameAt(timeline, ms);
      ctx.globalAlpha = 1;
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, W, H);
      drawFill(ctx, slides[index]);
      if (next !== null && mix > 0) {
        ctx.globalAlpha = mix;
        drawFill(ctx, slides[next]);
        ctx.globalAlpha = 1;
      }
    };
    paint(0);

    let recorder: MediaRecorder;
    const stream = canvas.captureStream(REEL_FPS);
    try {
      recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: BITS_PER_SECOND,
      });
    } catch {
      for (const track of stream.getTracks()) track.stop();
      setPhase({
        kind: "failed",
        message: "This browser refused to record the video. Try Chrome.",
      });
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start(1000);

    // Every animation frame is painted, even between crossfades, so the
    // video has a steady frame rate. A hidden tab stops animation frames:
    // the page asks to be kept in front. The last picture is held a little
    // past the end: the recording starts a moment after the first frame and
    // otherwise came out about half a second short (Chrome, 2026-11-22).
    const stopAt =
      timeline.totalMs + Math.min(TAIL_MS, REEL_MAX_MS - timeline.totalMs);
    const started = performance.now();
    let shown = 0;
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (run.cancelled) return resolve();
        const ms = performance.now() - started;
        paint(Math.min(ms, timeline.totalMs));
        if (ms - shown >= 250) {
          shown = ms;
          setPhase({
            kind: "recording",
            ms: Math.min(ms, timeline.totalMs),
            totalMs: timeline.totalMs,
          });
        }
        if (ms >= stopAt) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    recorder.stop();
    await stopped;
    for (const track of stream.getTracks()) track.stop();
    if (run.cancelled) return;

    const type = mimeType.split(";")[0];
    const blob = new Blob(chunks, { type });
    if (blob.size === 0) {
      setPhase({
        kind: "failed",
        message:
          "The recording came out empty. Keep this tab in front and try again.",
      });
      return;
    }
    const url = URL.createObjectURL(blob);
    madeUrl.current = url;
    setPhase({
      kind: "done",
      made: {
        url,
        fileName: `${reel.fileBase}.${reelFileExtension(mimeType)}`,
        mimeType,
        bytes: blob.size,
        seconds: Math.round(timeline.totalMs / 1000),
        skipped,
      },
    });
  };

  const totalSeconds = Math.round(
    reelTimeline(reel.frames.length).totalMs / 1000,
  );

  return (
    <div className="space-y-2 rounded border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Clapperboard className="h-4 w-4" aria-hidden />
        <span className="text-sm font-medium">Video for Reels and TikTok</span>
        <span className="text-xs text-muted-foreground">
          {reel.frames.length} pictures, about {totalSeconds} s, no sound
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        The cover, then each event&apos;s Story picture, 1080×1920. Instagram
        needs MP4: recent Chrome and Safari make MP4, other browsers make WebM.
        Add a trending sound in Instagram or TikTok. TikTok (@abontenhub) takes
        the same video with the Instagram feed caption (&ldquo;link in
        bio&rdquo;). Keep this tab in front while it records.
      </p>

      <div className="flex flex-wrap items-start gap-3">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label="Video preview"
          className={
            busy
              ? "h-[240px] w-[135px] rounded border border-border bg-black"
              : "hidden"
          }
        />
        <div className="min-w-0 flex-1 space-y-2">
          {supported === false ? (
            <p className="text-sm text-destructive">
              This browser can&apos;t record video. Use a recent Chrome or
              Safari.
            </p>
          ) : null}

          {phase.kind === "loading" ? (
            <Progress
              label={`Loading pictures (${phase.done} of ${phase.total})`}
              value={phase.total ? phase.done / phase.total : 0}
            />
          ) : null}
          {phase.kind === "recording" ? (
            <Progress
              label={`Recording: ${Math.floor(phase.ms / 1000)} s of ${Math.round(phase.totalMs / 1000)} s`}
              value={phase.totalMs ? phase.ms / phase.totalMs : 0}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {busy ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={cancel}
              >
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant={phase.kind === "done" ? "outline" : "primary"}
                disabled={supported === false || reel.frames.length === 0}
                onClick={() => void make()}
              >
                <Clapperboard className="h-3.5 w-3.5" aria-hidden />
                {phase.kind === "done"
                  ? "Make it again"
                  : "Make video (Reel / TikTok)"}
              </Button>
            )}
            {phase.kind === "done" ? (
              <a
                href={phase.made.url}
                download={phase.made.fileName}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download {phase.made.fileName}
              </a>
            ) : null}
          </div>

          {phase.kind === "idle" && phase.note ? (
            <p className="text-xs text-muted-foreground">{phase.note}</p>
          ) : null}
          {phase.kind === "failed" ? (
            <p className="text-sm text-destructive" aria-live="polite">
              {phase.message}
            </p>
          ) : null}
          {phase.kind === "done" ? <MadeSummary made={phase.made} /> : null}
        </div>
      </div>
    </div>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="space-y-1">
      <p className="text-xs" aria-live="polite">
        {label}
      </p>
      <progress
        value={percent}
        max={100}
        aria-label={label}
        className="h-1.5 w-full max-w-xs accent-primary"
      />
    </div>
  );
}

function MadeSummary({ made }: { made: Made }) {
  const mp4 = reelFileExtension(made.mimeType) === "mp4";
  return (
    <div className="space-y-2" aria-live="polite">
      <p className={mp4 ? "text-xs text-success" : "text-xs text-warning"}>
        {mp4
          ? `MP4 (H.264), ${made.seconds} s, ${formatFileSize(made.bytes, "en")}: ready for Instagram and TikTok.`
          : `WebM, ${made.seconds} s, ${formatFileSize(made.bytes, "en")}. Instagram doesn't take WebM: make it again in a recent Chrome or Safari, or convert it to MP4 first.`}
      </p>
      {made.skipped > 0 ? (
        <p className="text-xs text-warning">
          {made.skipped === 1
            ? "One event's picture didn't load and was left out."
            : `${made.skipped} events' pictures didn't load and were left out.`}
        </p>
      ) : null}
      <video
        src={made.url}
        controls
        muted
        playsInline
        className="h-[240px] w-[135px] rounded border border-border bg-black"
      />
    </div>
  );
}
