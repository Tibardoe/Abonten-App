"use client";

import { useEffect, useState } from "react";

const WARNING_THRESHOLD_SECONDS = 120;

/**
 * Ticks down toward a server-issued `expires_at` timestamp (ticket_checkout
 * or subscription_checkout). This is display-only: the deadline itself
 * comes from the database, and actual enforcement happens server-side
 * (expire_stale_ticket_checkouts / expire_stale_subscription_checkouts, both
 * cron'd and re-run on every checkout read/write) — this hook never decides
 * that a checkout is expired on the server's behalf, it only reflects it.
 */
export function useCheckoutCountdown(expiresAt: string | null | undefined) {
  const target = expiresAt ? new Date(expiresAt).getTime() : null;
  // Starts `null` (not Date.now()) so the server render and the client's
  // first hydration pass produce identical output — both render nothing
  // until this effect runs post-mount. Seeding this with Date.now() at
  // render time caused a hydration mismatch, since the server's "now" and
  // the client's "now" a few hundred milliseconds (or, on a slow request,
  // several seconds) later are never the same value.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!target) return;

    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [target]);

  if (!target || now === null) {
    return { secondsLeft: null, isExpired: false, isWarning: false };
  }

  const secondsLeft = Math.max(0, Math.round((target - now) / 1000));

  return {
    secondsLeft,
    isExpired: secondsLeft <= 0,
    isWarning: secondsLeft > 0 && secondsLeft <= WARNING_THRESHOLD_SECONDS,
  };
}

export function formatCountdown(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (secondsLeft % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}
