"use client";

import { getShowcaseWall } from "@/actions/showcase/getShowcaseWall";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { answerOrThrow } from "@abonten/core/envelopeFailure";
import type { ShowcaseWall } from "@abonten/types/showcaseType";
import { useQuery } from "@tanstack/react-query";

// The "On Abonten" wall for this visitor (docs/architecture/showcase.md).
// Read in the browser, per visitor: the tiles carry the visitor's own
// follow state, and the pages it sits on are cached for everyone. Keyed by
// the signed-in user, so signing in or out never shows another answer from
// the cache. A failed read is a query error (the section stays hidden),
// never an empty wall.
export function useShowcaseWall(
  place: { lat?: number | null; lng?: number | null } = {},
) {
  const { data: user, isPending: userPending } = useCurrentUser();
  // Coordinates only choose a city; rounding keeps GPS jitter from making
  // a new cache entry.
  const lat = place.lat == null ? null : Math.round(place.lat * 100) / 100;
  const lng = place.lng == null ? null : Math.round(place.lng * 100) / 100;
  return useQuery({
    queryKey: ["showcase", "wall", user?.id ?? null, lat, lng],
    enabled: !userPending,
    queryFn: async (): Promise<ShowcaseWall | null> => {
      const res = answerOrThrow(
        await getShowcaseWall({
          lat: lat ?? undefined,
          lng: lng ?? undefined,
        }),
      );
      return res.status === 200 ? (res.data ?? null) : null;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
