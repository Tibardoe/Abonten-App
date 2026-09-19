import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import {
  DISABLED_WEEKLY_PROGRAM,
  type WeeklyEditionResult,
  type WeeklyProgram,
  type WeeklyTeaser,
} from "@abonten/types/weeklyType";
import { useQuery } from "@tanstack/react-query";

// Abonten Weekly data for the app. Everything goes through /api/mobile/weekly
// (the tables are service-role only). Every key includes the signed-in user,
// because while the programme is open to staff or beta testers the answer
// depends on who is asking, and signing in or out must never show the other
// person's answer from cache.

export const WEEKLY_KEY = ["mobile", "weekly"] as const;

export function useWeeklyProgram() {
  const { session } = useSession();
  const query = useQuery({
    queryKey: [...WEEKLY_KEY, "program", session?.user.id ?? null],
    queryFn: async (): Promise<WeeklyProgram> => {
      const res = await api.weekly.program();
      // A server hiccup, or a 401 while the token cannot be refreshed,
      // must not replace a known answer (possibly restored from disk) with
      // "switched off": throw so React Query keeps the last good value. A
      // definite answer still applies.
      if (res.status >= 500 || res.status === 429 || res.status === 401) {
        throw new Error(res.message ?? "Programme check failed");
      }
      return res.status === 200 && res.data
        ? res.data
        : DISABLED_WEEKLY_PROGRAM;
    },
    staleTime: 5 * 60 * 1000,
  });
  return { ...query, program: query.data ?? DISABLED_WEEKLY_PROGRAM };
}

export type WeeklyEditionQuery = {
  scope?: string;
  week?: string;
  lat?: number;
  lng?: number;
};

export type WeeklyEditionState = WeeklyEditionResult & {
  /** 404: that edition or area is not available. */
  notFound: boolean;
};

export function useWeeklyEdition(params: WeeklyEditionQuery) {
  const { session } = useSession();
  // Coordinates only choose an area; rounding keeps small GPS jitter from
  // making a new cache entry.
  const lat =
    params.lat == null ? undefined : Math.round(params.lat * 100) / 100;
  const lng =
    params.lng == null ? undefined : Math.round(params.lng * 100) / 100;
  return useQuery({
    queryKey: [
      ...WEEKLY_KEY,
      "edition",
      session?.user.id ?? null,
      params.scope ?? null,
      params.week ?? null,
      params.scope || params.week ? null : (lat ?? null),
      params.scope || params.week ? null : (lng ?? null),
    ],
    queryFn: async (): Promise<WeeklyEditionState> => {
      const res = await api.weekly.edition({
        scope: params.scope,
        week: params.week,
        lat: params.scope || params.week ? undefined : lat,
        lng: params.scope || params.week ? undefined : lng,
      });
      if (res.status >= 500 || (res.status !== 200 && res.status !== 404)) {
        throw new Error(res.message ?? "Couldn't load Abonten Weekly.");
      }
      return {
        available: res.data?.available ?? false,
        edition: res.data?.edition ?? null,
        fallbackEvents: res.data?.fallbackEvents ?? [],
        notFound: res.status === 404,
      };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useWeeklyTeaser(
  location: { lat: number; lng: number } | null,
  enabled: boolean,
) {
  const { session } = useSession();
  const lat = location ? Math.round(location.lat * 100) / 100 : null;
  const lng = location ? Math.round(location.lng * 100) / 100 : null;
  return useQuery({
    queryKey: [...WEEKLY_KEY, "teaser", session?.user.id ?? null, lat, lng],
    enabled,
    queryFn: async (): Promise<WeeklyTeaser | null> => {
      const res = await api.weekly.teaser({
        lat: lat ?? undefined,
        lng: lng ?? undefined,
      });
      return res.status === 200 ? (res.data ?? null) : null;
    },
    staleTime: 10 * 60 * 1000,
  });
}
