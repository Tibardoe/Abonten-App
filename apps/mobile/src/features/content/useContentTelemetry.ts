import { api } from "@/lib/api";
import { uuidv4 } from "@/lib/uuid";
import {
  type PlaySession,
  viewEventsFor,
} from "@abonten/core/content/viewTracking";
import type {
  ContentClickKind,
  ContentViewEventInput,
  ContentViewSurface,
} from "@abonten/types/contentType";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";

// Batched view telemetry for Spotlight and Stories. The server validates,
// de-duplicates and rate-limits everything again, so nothing here can
// inflate a count; this only keeps a scrolling feed from costing a request
// per card.

const VIEWER_KEY = "abonten.contentViewerKey";
const FLUSH_MS = 5000;
const MAX_BATCH = 50;

let viewerKey: Promise<string> | null = null;

/** A random per-install key for view counting. Identifies nobody. */
export function getContentViewerKey(): Promise<string> {
  if (!viewerKey) {
    viewerKey = (async () => {
      try {
        const existing = await SecureStore.getItemAsync(VIEWER_KEY);
        if (existing && existing.length >= 8) return existing;
        const fresh = uuidv4();
        await SecureStore.setItemAsync(VIEWER_KEY, fresh);
        return fresh;
      } catch {
        return uuidv4();
      }
    })();
  }
  return viewerKey;
}

let queue: ContentViewEventInput[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let appStateInstalled = false;

export async function flushContentViews(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const batch = queue.slice(0, 100);
  queue = queue.slice(100);
  try {
    await api.content.views(await getContentViewerKey(), batch);
  } catch {
    // Best effort: a lost batch only under-counts.
  }
  if (queue.length > 0) schedule();
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flushContentViews();
  }, FLUSH_MS);
}

export function queueContentViews(events: ContentViewEventInput[]) {
  if (events.length === 0) return;
  if (!appStateInstalled) {
    appStateInstalled = true;
    AppState.addEventListener("change", (state) => {
      if (state !== "active") void flushContentViews();
    });
  }
  queue.push(...events);
  if (queue.length >= MAX_BATCH) void flushContentViews();
  else schedule();
}

export function trackContentClick(
  postId: string,
  kind: ContentClickKind,
  campaignId?: string | null,
) {
  void (async () => {
    try {
      await api.content.click({
        viewerKey: await getContentViewerKey(),
        postId,
        kind,
        campaignId: campaignId ?? null,
      });
    } catch {
      // Best effort.
    }
  })();
}

/**
 * One play session for a post while `active`: an impression the first time
 * it becomes active, then view_start / meaningful_view / completion / replay
 * each time it stops being active (scrolled away, viewer closed).
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
      onPlaying: () => {
        if (startedAt.current === null) startedAt.current = Date.now();
      },
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
