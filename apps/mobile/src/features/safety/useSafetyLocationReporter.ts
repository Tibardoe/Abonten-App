import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { useIsOnline } from "@/lib/network";
import { useAppActive } from "@/lib/useAppActive";
import type { SafetyLocationBody } from "@abonten/api-client";
import { isSessionOpen, locationIntervalMs } from "@abonten/core/safety/rules";
import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useEffect, useRef } from "react";
import { readSafetyLocationPermission, toSafetyPoint } from "./safetyLocation";
import {
  PENDING_SOS_MAX_AGE_MS,
  clearPendingSos,
  readPendingSos,
} from "./safetyStore";
import {
  retryPendingSos,
  safetyOverviewKey,
  useApplySafetySession,
  useSafetyOverview,
  useSafetyProgram,
} from "./useSafety";

// Keeps an open Safety session supplied with positions for as long as the
// app is in front — on any screen, not only Safety — and sends again an SOS
// that never reached the server. Mounted once for the signed-in app
// (StackHost). Never asks for permission: SOS, check-in and share ask when
// the person starts them. Foreground only in this version (docs/architecture/
// safety.md §12): with the phone locked, contacts see the last position and
// how old it is.

const MAX_BATCH = 20;

export function useSafetyLocationReporter(): void {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { program } = useSafetyProgram();
  const overview = useSafetyOverview({ enabled: program.enabled });
  const active = overview.data?.data?.active ?? null;
  const appActive = useAppActive();
  const online = useIsOnline();
  const qc = useQueryClient();
  const apply = useApplySafetySession();
  const buffer = useRef<SafetyLocationBody[]>([]);

  // Coming back to the app re-reads the session (it may have been closed on
  // another device, escalated, or answered by a contact).
  useEffect(() => {
    if (appActive && userId && program.enabled) {
      void qc.invalidateQueries({ queryKey: safetyOverviewKey(userId) });
    }
  }, [appActive, userId, program.enabled, qc]);

  // An SOS sent while offline goes again once the connection is back.
  useEffect(() => {
    if (!userId || !online) return;
    let cancelled = false;
    void (async () => {
      const pending = await readPendingSos(userId);
      if (!pending || cancelled) return;
      if (Date.now() - pending.startedAt > PENDING_SOS_MAX_AGE_MS) {
        await clearPendingSos(userId);
        return;
      }
      const sent = await retryPendingSos(userId, pending);
      if (sent && !cancelled) apply(sent);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, online, apply]);

  const sessionId = active && isSessionOpen(active.status) ? active.id : null;
  const status = active?.status ?? null;

  useEffect(() => {
    if (!sessionId || !status || !appActive) return;
    const interval = locationIntervalMs(status);
    if (!interval) return;
    let stopped = false;
    let watcher: Location.LocationSubscription | null = null;

    // `final`: the last send as the effect ends (the app went to the
    // background, or the session changed).
    const flush = async (final = false) => {
      if ((stopped && !final) || buffer.current.length === 0) return;
      const points = buffer.current.splice(0, MAX_BATCH);
      try {
        const res = await api.safety.recordLocation(sessionId, points);
        if (res.status === 410 || res.status === 404) {
          // Over (closed elsewhere, or it ran out): read the new state.
          void qc.invalidateQueries({ queryKey: safetyOverviewKey(userId) });
        } else if (res.status >= 500 || res.status === 429) {
          buffer.current.unshift(...points.slice(-5));
        }
      } catch {
        // Offline: keep the latest few for the next try.
        buffer.current.unshift(...points.slice(-5));
      }
    };

    void (async () => {
      if ((await readSafetyLocationPermission()) !== "granted" || stopped)
        return;
      try {
        watcher = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: Math.min(interval, 30_000),
            distanceInterval: 0,
          },
          (pos) => {
            buffer.current.push(toSafetyPoint(pos));
            if (buffer.current.length > MAX_BATCH) {
              buffer.current.splice(0, buffer.current.length - MAX_BATCH);
            }
          },
        );
        if (stopped) watcher.remove();
      } catch {
        // No position service: the session keeps its last position.
      }
    })();

    const timer = setInterval(() => void flush(), interval);
    // The first position goes at once, not after a whole interval.
    const first = setTimeout(() => void flush(), 3_000);
    return () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(first);
      watcher?.remove();
      void flush(true);
    };
  }, [sessionId, status, appActive, qc, userId]);
}
