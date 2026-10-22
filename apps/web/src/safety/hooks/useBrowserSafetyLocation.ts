"use client";

import { recordSafetyLocation } from "@/actions/safety/recordSafetyLocation";
import { isSessionOpen, locationIntervalMs } from "@abonten/core/safety/rules";
import type { SafetySessionStatus } from "@abonten/types/safetyType";
import type { SafetyLocationPointInput } from "@abonten/validation/safetySchemas";
import { useEffect, useRef } from "react";

// Positions from the browser while a Safety session is open and this page
// is showing, plus a screen wake lock during an alert so the phone does not
// sleep and stop sending. The browser asks for permission the first time.

export function toBrowserPoint(
  pos: GeolocationPosition,
): SafetyLocationPointInput {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracyM: Number.isFinite(pos.coords.accuracy)
      ? Math.round(pos.coords.accuracy)
      : null,
    at: new Date(pos.timestamp || Date.now()).toISOString(),
    source: "browser",
  };
}

/** One position, or null within `timeoutMs` (or when refused). */
export function browserFix(
  timeoutMs = 4000,
): Promise<SafetyLocationPointInput | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(toBrowserPoint(pos)),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 120_000 },
    );
  });
}

type WakeLockSentinelLike = { release: () => Promise<void> };

export function useBrowserSafetyLocation(
  session: { id: string; status: SafetySessionStatus } | null,
  onClosed: () => void,
): void {
  const buffer = useRef<SafetyLocationPointInput[]>([]);
  const sessionId =
    session && isSessionOpen(session.status) ? session.id : null;
  const status = session?.status ?? null;

  useEffect(() => {
    if (!sessionId || !status || !navigator.geolocation) return;
    const interval = locationIntervalMs(status);
    if (!interval) return;
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        buffer.current.push(toBrowserPoint(pos));
        if (buffer.current.length > 20)
          buffer.current.splice(0, buffer.current.length - 20);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 10_000 },
    );
    const flush = async () => {
      if (buffer.current.length === 0 || document.visibilityState !== "visible")
        return;
      const points = buffer.current.splice(0, 20);
      const res = await recordSafetyLocation({ sessionId, points }).catch(
        () => null,
      );
      if (!res) buffer.current.unshift(...points.slice(-5));
      else if (res.status === 410 || res.status === 404) onClosed();
    };
    const timer = window.setInterval(() => void flush(), interval);
    const first = window.setTimeout(() => void flush(), 3000);
    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, [sessionId, status, onClosed]);

  useEffect(() => {
    if (status !== "alerting") return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    let lock: WakeLockSentinelLike | null = null;
    let cancelled = false;
    const request = () => {
      nav.wakeLock
        ?.request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {});
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [status]);
}
