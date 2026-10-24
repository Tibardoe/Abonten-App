import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import {
  DISABLED_IDENTITY_PROGRAM,
  type IdentityOverview,
} from "@abonten/types/identityType";
import { useQuery } from "@tanstack/react-query";

// Identity verification for the app. Everything goes through
// /api/mobile/identity (the tables are service-role only). Keys include the
// signed-in user, so one account never sees another's result from cache;
// nothing here is in the persisted-query allowlist.

export const IDENTITY_KEY = ["mobile", "identity"] as const;
const POLL_MS = 5_000;

export function identityOverviewKey(userId: string | null | undefined) {
  return [...IDENTITY_KEY, "overview", userId ?? null] as const;
}

export function useIdentityOverview(
  options: {
    staleTime?: number;
    /** Ask again every few seconds while this says so (after each answer). */
    pollWhile?: (overview: IdentityOverview | null) => boolean;
  } = {},
) {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { pollWhile } = options;
  const query = useQuery({
    queryKey: identityOverviewKey(userId),
    enabled: !!userId,
    queryFn: async () => settleEnvelope(await api.identity.overview()),
    staleTime: options.staleTime ?? 15_000,
    refetchInterval: (q) => {
      if (!pollWhile) return false;
      const res = q.state.data;
      return pollWhile(res?.status === 200 ? (res.data ?? null) : null)
        ? POLL_MS
        : false;
    },
  });
  const overview: IdentityOverview | null =
    query.data?.status === 200 ? (query.data.data ?? null) : null;
  return {
    ...query,
    overview,
    program: overview?.program ?? DISABLED_IDENTITY_PROGRAM,
  };
}
