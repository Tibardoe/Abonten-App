"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * A short rest after an action, counted down a second at a time: "Check
 * payment" / "Check status" rest for a few seconds after each press, with
 * the seconds shown, so one press is visibly one check and nobody hammers
 * the payment provider.
 */
export function useCooldown(): {
  secondsLeft: number;
  start: (seconds: number) => void;
} {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const start = useCallback((seconds: number) => setSecondsLeft(seconds), []);

  return { secondsLeft, start };
}
