import { prefetchEventDetail } from "@/features/discovery/useEventDetail";
import { prefetchPlaceDetail } from "@/features/places/usePlaceDetail";
import { isConnectionExpensive, useIsOnline } from "@/lib/network";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** The first cards of a list are the likeliest taps; only those are warmed. */
const WARM_COUNT = 6;

/**
 * Loads the detail of the first few cards a list shows, in the background,
 * so opening one renders at once — and, because details are persisted, is
 * still there offline after a restart. Deliberately narrow: only the top
 * of the list, only on an unmetered connection, never again for a detail
 * already cached and fresh (prefetchQuery checks), so it costs a handful of
 * small reads rather than a download of everything on screen. Every other
 * card is fetched on touch-down instead (EventCard / PlaceCard onPressIn).
 */
export function useWarmDetails(kind: "event" | "place", ids: string[]): void {
  const qc = useQueryClient();
  const online = useIsOnline();
  const key = [...new Set(ids)].slice(0, WARM_COUNT).join(",");

  useEffect(() => {
    if (!online || !key) return;
    let cancelled = false;
    void isConnectionExpensive().then((expensive) => {
      if (cancelled || expensive) return;
      for (const id of key.split(",")) {
        if (kind === "event") prefetchEventDetail(qc, id);
        else prefetchPlaceDetail(qc, id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [online, key, kind, qc]);
}
