"use client";

import { ingestContentViews } from "@/actions/content/ingestContentViews";
import { recordContentClick } from "@/actions/content/recordContentClick";
import {
  type PlaySession,
  viewEventsFor,
} from "@abonten/core/content/viewTracking";
import type {
  ContentClickKind,
  ContentViewEventInput,
  ContentViewSurface,
} from "@abonten/types/contentType";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getViewerKey } from "../lib/viewerKey";

// Batches view telemetry so scrolling a feed never costs a request per
// card. The database validates and de-duplicates everything again; nothing
// here can inflate a count.

const FLUSH_MS = 5000;
const MAX_BATCH = 50;

let queue: ContentViewEventInput[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;

function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return Promise.resolve();
  const batch = queue.slice(0, 100);
  queue = queue.slice(100);
  const sent = ingestContentViews({ viewerKey: getViewerKey(), events: batch })
    .then(() => undefined)
    .catch(() => {
      // Telemetry is best effort. A lost batch only under-counts.
    });
  if (queue.length > 0) schedule();
  return sent;
}

function schedule() {
  if (timer) return;
  timer = setTimeout(flush, FLUSH_MS);
}

function installListeners() {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

/** Sends whatever is queued now (a Story viewer closing, for example). */
export function flushContentViews(): Promise<void> {
  return flush();
}

export function queueContentViews(events: ContentViewEventInput[]) {
  if (events.length === 0) return;
  installListeners();
  queue.push(...events);
  if (queue.length >= MAX_BATCH) flush();
  else schedule();
}

export function trackContentClick(
  postId: string,
  kind: ContentClickKind,
  campaignId?: string | null,
) {
  recordContentClick({
    viewerKey: getViewerKey(),
    postId,
    kind,
    campaignId: campaignId ?? null,
  }).catch(() => {});
}

/**
 * Measures one play session for a post while `active` is true: an
 * impression the first time it becomes active, then view_start /
 * meaningful_view / completion / replay each time it stops being active.
 */
export function usePlaySession({
  postId,
  surface,
  campaignId,
  active,
  durationMs,
}: {
  postId: string;
  surface: ContentViewSurface;
  campaignId?: string | null;
  active: boolean;
  durationMs: number | null;
}) {
  const impressed = useRef(false);
  const startedAt = useRef<number | null>(null);
  const session = useRef<PlaySession>({
    watchedMs: 0,
    durationMs,
    loops: 0,
    reachedEnd: false,
  });

  const stopClock = useCallback(() => {
    if (startedAt.current !== null) {
      session.current.watchedMs += Date.now() - startedAt.current;
      startedAt.current = null;
    }
  }, []);

  const report = useCallback(() => {
    stopClock();
    const kinds = viewEventsFor({ ...session.current, durationMs });
    queueContentViews(
      kinds.map((kind) => ({
        postId,
        kind,
        watchedMs: Math.round(session.current.watchedMs),
        surface,
        campaignId: campaignId ?? null,
      })),
    );
    session.current = {
      watchedMs: 0,
      durationMs,
      loops: 0,
      reachedEnd: false,
    };
  }, [campaignId, durationMs, postId, stopClock, surface]);

  useEffect(() => {
    if (!active) return;
    if (!impressed.current) {
      impressed.current = true;
      queueContentViews([
        { postId, kind: "impression", surface, campaignId: campaignId ?? null },
      ]);
    }
    return () => report();
  }, [active, campaignId, postId, report, surface]);

  return useMemo(
    () => ({
      /** Media actually started playing (or an image became visible). */
      onPlaying: () => {
        if (startedAt.current === null) startedAt.current = Date.now();
      },
      /** Paused, buffering or stopped. */
      onPaused: stopClock,
      onEnded: () => {
        session.current.reachedEnd = true;
      },
      onLoop: () => {
        session.current.loops += 1;
      },
    }),
    [stopClock],
  );
}
