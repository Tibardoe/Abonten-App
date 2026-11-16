"use client";

import { getEventPromoterOffer } from "@/actions/getEventPromoterOffer";
import { useReferralCode } from "@/hooks/useReferralCode";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

/**
 * "Share and earn": shown under an event's share button when the organizer
 * pays promoters a commission and the viewer's share links carry their
 * referral code (signed in, capture on).
 */
export default function PromoterEarnHint({ eventId }: { eventId: string }) {
  const t = useTranslations("events");

  const code = useReferralCode();
  const { data } = useQuery({
    queryKey: ["promoter-offer", eventId],
    queryFn: () => getEventPromoterOffer(eventId),
    enabled: !!code,
    staleTime: 5 * 60_000,
  });
  const offer = data?.status === 200 ? data.data : null;
  const rate = offer?.rateBps;
  if (!code || !rate) return null;
  return (
    <p className="mt-2 text-center text-xs text-muted-foreground">
      {/* Added by the organizer: their own rate, said as theirs (X33). */}
      {t.rich(
        offer?.invited ? "invitedPromoterRate" : "organizerPaysPromotersRate",
        {
          rate: Number((rate / 100).toFixed(2)),
          strong: (chunks) => (
            <span className="font-semibold text-foreground">{chunks}</span>
          ),
        },
      )}
    </p>
  );
}
