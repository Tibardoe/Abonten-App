import { api } from "@/lib/api";
import type { CreditActivityItem } from "@abonten/types/rewards";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

// Abonten Rewards reads. Every number comes from the server (the ledger is
// the source of truth); the app only formats it.

const PROGRAM_KEY = ["mobile", "rewards", "program"] as const;
const SUMMARY_KEY = ["mobile", "rewards", "summary"] as const;
const ACTIVITY_KEY = ["mobile", "rewards", "activity"] as const;
const INVITE_KEY = ["mobile", "rewards", "invite"] as const;

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

/** The caller's friend-invite link, offer, stats and who invited them. */
export function useReferralInvite(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: INVITE_KEY,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const res = await api.rewards.invite();
      if (res.status !== 200 || !res.data) {
        throw new Error(res.message ?? "Couldn't load your invites");
      }
      return res.data;
    },
    staleTime: 30_000,
  });
}

/** Whether friend invites are live (works signed out). */
export function useInvitesLive() {
  return useQuery({
    queryKey: ["mobile", "invites-live"],
    queryFn: async () =>
      (await api.rewards.resolveReferral()).data?.programOn === true,
    staleTime: 10 * 60_000,
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

/**
 * What the "Use credit" switch can apply to a pending promotion checkout.
 * Null when Rewards or spending on promotions is off, or there's no credit.
 */
export function usePromotionCreditQuote(
  kind: "event" | "place",
  checkoutId: string | null,
) {
  return useQuery({
    queryKey: ["mobile", "rewards", "promotion-quote", kind, checkoutId],
    enabled: !!checkoutId,
    queryFn: async () => {
      const res = await api.checkout.promotionCreditQuote({
        kind,
        checkoutId: checkoutId as string,
      });
      const quote = res.status === 200 ? res.data : undefined;
      return quote?.offered && quote.creditMinor > 0 ? quote : null;
    },
    staleTime: 0,
  });
}

/** Balances and activity change after spending credit. */
export function useInvalidateCredit() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["mobile", "rewards"] });
  };
}

export function flattenCreditActivity(
  pages: { data?: CreditActivityItem[] }[] | undefined,
): CreditActivityItem[] {
  // An error-envelope page has no `data` array; never inject undefined.
  return pages?.flatMap((p) => (Array.isArray(p.data) ? p.data : [])) ?? [];
}
