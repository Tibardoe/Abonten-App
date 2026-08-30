"use client";

import {
  MAX_TRIM_SEGMENT_DURATION,
  MIN_TRIM_DURATION,
} from "@/hooks/useMediaSelection";
import formatDuration from "@/utils/formatVideoDuration";
import type { MediaItem } from "@abonten/types/mediaItemType";
import { useEffect, useRef, useState } from "react";

type DragHandle = "start" | "end" | "middle" | null;

type VideoTrimEditorProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  mediaItem: MediaItem;
  timelineStatus: "idle" | "loading" | "ready" | "error";
  onTrimChange: (startTime: number, endTime: number) => void;
};

// Professional-style mobile trim control: a real thumbnail timeline, two
// draggable handles (Pointer Events + setPointerCapture, so a drag always
// stays bound to the handle that started it regardless of what's under the
// pointer on release), a draggable selection window, and a playhead synced
// to the video's own timeupdate event.
export default function VideoTrimEditor({
  videoRef,
  mediaItem,
  timelineStatus,
  onTrimChange,
}: VideoTrimEditorProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragOffsetRef = useRef(0);
  const [dragHandle, setDragHandle] = useState<DragHandle>(null);

  const duration = mediaItem.duration ?? 0;
  const startTime = mediaItem.startTime ?? 0;
  const endTime = mediaItem.endTime ?? duration;

  // Latest trim bounds, readable from the timeupdate listener without
  // forcing that listener to be torn down/re-added on every drag update.
  const trimBoundsRef = useRef({ startTime, endTime, duration });
  useEffect(() => {
    trimBoundsRef.current = { startTime, endTime, duration };
  }, [startTime, endTime, duration]);

  // Re-subscribed only when the video element itself changes (a different
  // media item was swapped in), not on every trim edit -- bounds are read
  // from trimBoundsRef instead, so the listener doesn't need to know about
  // start/end/duration directly.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on mediaItem.id only, videoRef is a stable ref
  useEffect(() => {
    const video = videoRef.current;
    const track = trackRef.current;
    if (!video || !track) return;

    const handleTimeUpdate = () => {
      const bounds = trimBoundsRef.current;
      if (bounds.duration > 0) {
        track.style.setProperty(
          "--playhead-position",
          `${(video.currentTime / bounds.duration) * 100}%`,
        );
      }
      if (!video.paused && video.currentTime >= bounds.endTime) {
        video.currentTime = bounds.startTime;
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [mediaItem.id]);

  const percentFor = (time: number) =>
    duration > 0 ? (time / duration) * 100 : 0;

  const handlePointerDown = (
    handleType: Exclude<DragHandle, null>,
    e: React.PointerEvent,
  ) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragHandle(handleType);

    if (handleType === "middle" && trackRef.current) {
      const rect = trackRef.current.getBoundingClientRect();
      const startPixel = (percentFor(startTime) / 100) * rect.width;
      dragOffsetRef.current = e.clientX - rect.left - startPixel;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragHandle || !trackRef.current || duration <= 0) return;

    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);

    if (dragHandle === "start") {
      let newStart = (x / rect.width) * duration;
      newStart = Math.max(0, Math.min(newStart, endTime - MIN_TRIM_DURATION));
      const newEnd =
        endTime - newStart > MAX_TRIM_SEGMENT_DURATION
          ? newStart + MAX_TRIM_SEGMENT_DURATION
          : endTime;
      onTrimChange(newStart, newEnd);
      if (videoRef.current) videoRef.current.currentTime = newStart;
    } else if (dragHandle === "end") {
      let newEnd = (x / rect.width) * duration;
      newEnd = Math.min(newEnd, duration);
      newEnd = Math.max(newEnd, startTime + MIN_TRIM_DURATION);
      const newStart =
        newEnd - startTime > MAX_TRIM_SEGMENT_DURATION
          ? newEnd - MAX_TRIM_SEGMENT_DURATION
          : startTime;
      onTrimChange(newStart, newEnd);
      if (videoRef.current) videoRef.current.currentTime = newEnd;
    } else if (dragHandle === "middle") {
      const length = endTime - startTime;
      let newStart = ((x - dragOffsetRef.current) / rect.width) * duration;
      newStart = Math.max(0, newStart);
      let newEnd = newStart + length;
      if (newEnd > duration) {
        newEnd = duration;
        newStart = Math.max(0, newEnd - length);
      }
      onTrimChange(newStart, newEnd);
      if (videoRef.current) videoRef.current.currentTime = newStart;
    }
  };

  const handlePointerUp = () => {
    if (!dragHandle) return;
    setDragHandle(null);
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      videoRef.current.pause();
    }
  };

  const handleTrackClick = (e: React.MouseEvent) => {
    if (dragHandle || !trackRef.current || !videoRef.current || duration <= 0)
      return;
    const rect = trackRef.current.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = Math.min(
      Math.max(percentage * duration, 0),
      duration,
    );
  };

  const nudge = (handleType: "start" | "end", delta: number) => {
    if (handleType === "start") {
      const newStart = Math.max(
        0,
        Math.min(startTime + delta, endTime - MIN_TRIM_DURATION),
      );
      onTrimChange(newStart, endTime);
    } else {
      const newEnd = Math.min(
        duration,
        Math.max(endTime + delta, startTime + MIN_TRIM_DURATION),
      );
      onTrimChange(startTime, newEnd);
    }
  };

  const handleKeyDown =
    (handleType: "start" | "end") => (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudge(handleType, e.shiftKey ? -2 : -0.5);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudge(handleType, e.shiftKey ? 2 : 0.5);
      }
    };

  const startPct = percentFor(startTime);
  const endPct = percentFor(endTime);
  const thumbnails = mediaItem.timelineThumbnails;

  return (
    <div className="px-2">
      <div className="flex justify-between text-white text-sm mb-2">
        <span>Start: {formatDuration(startTime)}</span>
        <span>End: {formatDuration(endTime)}</span>
        <span>Duration: {formatDuration(endTime - startTime)}</span>
      </div>

      <div
        ref={trackRef}
        className="relative h-16 cursor-pointer select-none"
        onClick={handleTrackClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleTrackClick(e as unknown as React.MouseEvent);
          }
        }}
        style={{ "--playhead-position": "0%" } as React.CSSProperties}
      >
        {/* Visual layer only -- clipped to the rounded track shape. Kept
            separate from the handles below so a handle sitting at the very
            start/end (the default, untrimmed state) never has half its
            touch target clipped away by this rounding. */}
        <div className="absolute inset-0 rounded-md overflow-hidden bg-gray-800">
          {/* Thumbnail timeline background */}
          <div className="absolute inset-0 flex">
            {thumbnails && thumbnails.length > 0 ? (
              thumbnails.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- tiny generated data URLs, not a real asset
                <img
                  key={`${mediaItem.id}-${i}`}
                  src={src}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  className="h-full flex-1 min-w-0 object-cover"
                />
              ))
            ) : (
              <div
                className={`h-full w-full bg-gray-700 ${
                  timelineStatus === "loading" ? "animate-pulse" : ""
                }`}
              />
            )}
          </div>

          {/* Dim the excluded portions so the selected region is unambiguous */}
          <div
            className="absolute inset-y-0 left-0 bg-black/60 pointer-events-none"
            style={{ width: `${startPct}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-black/60 pointer-events-none"
            style={{ width: `${100 - endPct}%` }}
          />
        </div>

        {/* Selected range -- draggable to move the whole window */}
        <div
          className="absolute top-0 bottom-0 border-y-2 border-mint cursor-grab active:cursor-grabbing touch-none z-10"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          onPointerDown={(e) => handlePointerDown("middle", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        {/* Start handle -- larger touch target than the visible thumb */}
        <button
          type="button"
          role="slider"
          aria-label="Trim start"
          aria-valuemin={0}
          aria-valuemax={endTime}
          aria-valuenow={startTime}
          aria-orientation="horizontal"
          className="absolute top-0 bottom-0 w-10 -translate-x-1/2 flex items-center justify-center cursor-ew-resize touch-none z-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mint rounded"
          style={{ left: `${startPct}%` }}
          onPointerDown={(e) => handlePointerDown("start", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown("start")}
        >
          <span className="h-10 w-1.5 rounded-full bg-mint shadow" />
        </button>

        {/* End handle */}
        <button
          type="button"
          role="slider"
          aria-label="Trim end"
          aria-valuemin={startTime}
          aria-valuemax={duration}
          aria-valuenow={endTime}
          aria-orientation="horizontal"
          className="absolute top-0 bottom-0 w-10 -translate-x-1/2 flex items-center justify-center cursor-ew-resize touch-none z-20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mint rounded"
          style={{ left: `${endPct}%` }}
          onPointerDown={(e) => handlePointerDown("end", e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown("end")}
        >
          <span className="h-10 w-1.5 rounded-full bg-mint shadow" />
        </button>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
          style={{ left: "var(--playhead-position)" }}
        />
      </div>
    </div>
  );
}
