"use client";

import { getReferralLink } from "@/actions/getReferralLink";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useQuery } from "@tanstack/react-query";

// The signed-in user's referral code, added to event share links as ?ref=.
// One cached fetch per visit, shared by every share button on the page;
// null when signed out or while referral capture is off.
export function useReferralCode(): string | null {
  const { data: user } = useCurrentUser();
  const { data } = useQuery({
    queryKey: ["referral-link", user?.id ?? null],
    queryFn: async () => (await getReferralLink()).data ?? null,
    enabled: !!user?.id,
    staleTime: 30 * 60 * 1000,
  });
  return data?.code ?? null;
}
