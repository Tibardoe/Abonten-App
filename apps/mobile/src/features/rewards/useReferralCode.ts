import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

// The signed-in user's referral code for event share links (?ref=), or null
// when signed out / while referral capture is off. One cached fetch.
export function useReferralCode(): string | null {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { data } = useQuery({
    queryKey: ["mobile", "rewards", "referral", userId],
    enabled: !!userId,
    queryFn: async () => (await api.rewards.referral()).data ?? null,
    staleTime: 30 * 60_000,
  });
  return data?.code ?? null;
}

/**
 * Logs a completed event share (analytics only -- shares are never
 * rewarded). event_share's own RLS lets a user insert only their own rows.
 */
export function logEventShare(
  userId: string,
  eventId: string,
  referralCode: string | null,
): void {
  void supabase
    .from("event_share")
    .insert({
      user_id: userId,
      event_id: eventId,
      channel: "native",
      referral_code: referralCode,
    })
    .then(() => {});
}
