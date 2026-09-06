import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

// Returns a millisecond timestamp that advances on a fixed interval and
// again every time the app is foregrounded. Screens that gate UI on "is
// this event happening / over right now" read this instead of calling
// Date.now() once at mount, so a screen left open (or backgrounded) across
// an occurrence's start/end time recomputes without a manual refresh.
//
// The value only changes when the whole second-bucket it represents
// changes, so it won't thrash renders faster than `intervalMs`.
export function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const bump = () => setNow(Date.now());

    const timer = setInterval(bump, intervalMs);

    const onAppStateChange = (state: AppStateStatus) => {
      if (state === "active") bump();
    };
    const sub = AppState.addEventListener("change", onAppStateChange);

    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [intervalMs]);

  return now;
}
