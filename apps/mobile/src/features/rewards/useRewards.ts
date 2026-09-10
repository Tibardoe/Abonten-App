import { api } from "@/lib/api";
import type { CreditActivityItem } from "@abonten/types/rewards";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

// Abonten Rewards reads. Every number comes from the server (the ledger is
// the source of truth); the app only formats it.

const PROGRAM_KEY = ["mobile", "rewards", "program"] as const;
const SUMMARY_KEY = ["mobile", "rewards", "summary"] as const;
const ACTIVITY_KEY = ["mobile", "rewards", "activity"] as const;

/** Whether Rewards is switched on for this user + the active terms. */
export function useRewardsProgram(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: PROGRAM_KEY,
    enabled: options?.enabled ?? true,
    queryFn: async () => (await api.rewards.program()).data ?? null,
    staleTime: 5 * 60_000,
  });
}

export function useCreditSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: SUMMARY_KEY,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const res = await api.rewards.summary();
      if (res.status !== 200 || !res.data) {
        throw new Error(res.message ?? "Couldn't load your credit");
      }
      return res.data;
    },
    staleTime: 30_000,
  });
}

export function useCreditActivity(options?: { enabled?: boolean }) {
  return useInfiniteQuery({
    queryKey: ACTIVITY_KEY,
    enabled: options?.enabled ?? true,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.rewards.activity({ cursor: pageParam, pageSize: 20 }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    staleTime: 30_000,
  });
}

export function flattenCreditActivity(
  pages: { data?: CreditActivityItem[] }[] | undefined,
): CreditActivityItem[] {
  // An error-envelope page has no `data` array; never inject undefined.
  return pages?.flatMap((p) => (Array.isArray(p.data) ? p.data : [])) ?? [];
}
