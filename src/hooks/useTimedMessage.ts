"use client";

import { useEffect, useRef, useState } from "react";

// Shared "show a message, then auto-clear it after a delay" behavior used by
// every upload flow's notification banner. Replaces the two different ad hoc
// idioms (a manual setTimeout effect vs a mutation's onSettled timeout) that
// existed for the same thing.
export function useTimedMessage(durationMs = 3000) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const showMessage = (text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(text);
    timerRef.current = setTimeout(() => setMessage(null), durationMs);
  };

  const clearMessage = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setMessage(null);
  };

  return { message, showMessage, clearMessage };
}
