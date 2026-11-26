import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import type { ShowcaseWall } from "@abonten/types/showcaseType";
import { useQuery } from "@tanstack/react-query";

// The "On Abonten" wall for the app (docs/architecture/showcase.md), read
// through /api/mobile/showcase (the tables are service-role only). Every
// key includes the signed-in user: the tiles carry their own follow state,
// and while the wall is open to staff or beta testers the answer depends on
// who is asking. Deliberately NOT in the offline persist allowlist
// (queryPersistPolicy.ts): follow state is personal.

export const SHOWCASE_KEY = ["mobile", "showcase"] as const;

function rounded(value: number | null | undefined): number | null {
  // Coordinates only choose a city; rounding keeps GPS jitter from making
  // a new cache entry.
  return value == null ? null : Math.round(value * 100) / 100;
}

/** The wall for this place: null when it is off for the caller or thin. */
export function useShowcaseWall(location: { lat: number; lng: number } | null) {
  const { session } = useSession();
  const lat = rounded(location?.lat);
  const lng = rounded(location?.lng);
  return useQuery({
    queryKey: [...SHOWCASE_KEY, "wall", session?.user.id ?? null, lat, lng],
    queryFn: async (): Promise<ShowcaseWall | null> => {
      // A server hiccup throws (React Query keeps the last answer and
      // retries); the section stays hidden meanwhile, never "nobody".
      const res = settleEnvelope(
        await api.showcase.wall({
          lat: lat ?? undefined,
          lng: lng ?? undefined,
        }),
      );
      return res.status === 200 ? (res.data ?? null) : null;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export type ShowcaseDirectoryState = {
  wall: ShowcaseWall | null;
  /** 404: the wall is not on for this caller. */
  notFound: boolean;
};

/** "See all": every host and place on the wall, in two groups. */
export function useShowcaseDirectory(
  location: { lat: number; lng: number } | null,
) {
  const { session } = useSession();
  const lat = rounded(location?.lat);
  const lng = rounded(location?.lng);
  return useQuery({
    queryKey: [
      ...SHOWCASE_KEY,
      "directory",
      session?.user.id ?? null,
      lat,
      lng,
    ],
    queryFn: async (): Promise<ShowcaseDirectoryState> => {
      const res = settleEnvelope(
        await api.showcase.directory({
          lat: lat ?? undefined,
          lng: lng ?? undefined,
        }),
      );
      if (res.status === 404) return { wall: null, notFound: true };
      if (res.status !== 200 || !res.data) {
        throw new Error(res.message ?? `showcase directory ${res.status}`);
      }
      return { wall: res.data.wall, notFound: false };
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Count a tap on a tile. Fire and forget: counting never gets in the way. */
export function recordShowcaseTap(entryId: string): void {
  api.showcase.tap(entryId).catch(() => {});
}
