import { useSession } from "@/auth/SessionProvider";
import { supabase } from "@/lib/supabase";
import { AppText, Icon } from "@abonten/ui-native";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { useReferralCode } from "./useReferralCode";
import { useRewardsProgram } from "./useRewards";

// "Share and earn" on an event (Rewards Phase 8): shown when the organizer
// pays promoters a commission and the viewer's share links carry their
// referral code. The offer is a public row; the program says whether
// commissions are live.
export function PromoterEarnNote({
  eventId,
  organizerId,
}: {
  eventId: string;
  organizerId: string | null;
}) {
  const { session } = useSession();
  const code = useReferralCode();
  const program = useRewardsProgram({ enabled: !!code });
  const terms = program.data?.enabled ? program.data.promoterCommission : null;
  const { data: rateBps } = useQuery({
    queryKey: ["mobile", "rewards", "promoter-offer", eventId],
    enabled: !!code && !!terms,
    queryFn: async () => {
      const { data } = await supabase
        .from("event_promoter_commission")
        .select("rate_bps")
        .eq("event_id", eventId)
        .eq("is_active", true)
        .maybeSingle();
      return data?.rate_bps ?? null;
    },
    staleTime: 5 * 60_000,
  });

  if (!code || !terms || !rateBps || session?.user.id === organizerId) {
    return null;
  }
  const rate = Math.min(Math.max(rateBps, terms.minRateBps), terms.maxRateBps);
  return (
    <View className="flex-row items-start gap-3 rounded-xl border border-border bg-card p-3">
      <Icon name="megaphone-outline" size={20} tone="primary" />
      <AppText variant="small" className="flex-1">
        Share this event and earn{" "}
        <AppText variant="small" className="font-semibold">
          {Number((rate / 100).toFixed(2))}%
        </AppText>{" "}
        of every ticket sold through your link. The organizer pays it as credit
        after the event. Tap share at the top.
      </AppText>
    </View>
  );
}
