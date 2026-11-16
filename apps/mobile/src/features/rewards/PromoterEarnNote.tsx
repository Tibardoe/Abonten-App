import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { settleEnvelope } from "@/lib/envelope";
import { formatPercent } from "@abonten/core/i18n/format";
import { AppText, Icon } from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useQuery } from "@tanstack/react-query";
import { View } from "react-native";
import { useReferralCode } from "./useReferralCode";
import { useRewardsProgram } from "./useRewards";

// "Share and earn" on an event (Rewards Phase 8): shown when the organizer
// pays promoters a commission and the viewer's share links carry their
// referral code. The server answers what this person earns: their own rate
// when the organizer added them as a promoter, the event's otherwise, and
// nothing on an event they run (unless an Owner added them, X36) or one
// that pays invited promoters only (X33).
export function PromoterEarnNote({
  eventId,
  organizerId,
}: {
  eventId: string;
  organizerId: string | null;
}) {
  const { locale } = useLocale();
  const t = useTranslations("rewards");

  const { session } = useSession();
  const code = useReferralCode();
  const program = useRewardsProgram({ enabled: !!code });
  const terms = program.data?.enabled ? program.data.promoterCommission : null;
  const me = session?.user.id ?? null;
  const { data: offer } = useQuery({
    queryKey: ["mobile", "rewards", "promoter-offer", eventId, me],
    enabled: !!code && !!terms && !!me && me !== organizerId,
    queryFn: async () => {
      const res = settleEnvelope(await api.rewards.promoterOffer(eventId));
      return res.status === 200 ? (res.data ?? null) : null;
    },
    staleTime: 5 * 60_000,
  });

  if (!code || !terms || !offer || me === organizerId) return null;
  return (
    <View className="flex-row items-start gap-3 rounded-xl border border-border bg-card p-3">
      <Icon name="megaphone-outline" size={20} tone="primary" />
      <AppText variant="small" className="flex-1">
        {/* One sentence, with the rate set in bold inside it: glued from
            three pieces it read "earn7%of every ticket". */}
        {t.rich(offer.invited ? "promoterInvitedNote" : "promoterEarnNote", {
          rate: formatPercent(offer.rateBps / 100, locale, {
            maximumFractionDigits: 2,
          }),
          b: (chunks) => (
            <AppText variant="small" className="font-semibold">
              {chunks}
            </AppText>
          ),
        })}
      </AppText>
    </View>
  );
}
