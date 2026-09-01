import { useEffect, useState } from "react";

// Native port of the web hooks/useCheckoutCountdown.ts. Display-only: the
// deadline is the server's `ticket_checkout.expires_at`; real enforcement is
// the server's `expire_stale_ticket_checkouts` sweep, re-run on every
// checkout read. This hook never decides expiry on the server's behalf — it
// only reflects it, and the screen refetches on hitting zero so the server's
// own "expired" state takes over.

const WARNING_THRESHOLD_SECONDS = 120;

export function useCheckoutCountdown(expiresAt: string | null | undefined) {
  const target = expiresAt ? new Date(expiresAt).getTime() : null;
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
