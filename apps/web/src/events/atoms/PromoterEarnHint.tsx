"use client";

import { getEventPromoterOffer } from "@/actions/getEventPromoterOffer";
import { useReferralCode } from "@/hooks/useReferralCode";
import { useQuery } from "@tanstack/react-query";

/**
 * "Share and earn": shown under an event's share button when the organizer
 * pays promoters a commission and the viewer's share links carry their
 * referral code (signed in, capture on).
 */
export default function PromoterEarnHint({ eventId }: { eventId: string }) {
  const code = useReferralCode();
  const { data } = useQuery({
    queryKey: ["promoter-offer", eventId],
    queryFn: () => getEventPromoterOffer(eventId),
    enabled: !!code,
    staleTime: 5 * 60_000,
  });
  const rate = data?.status === 200 ? data.data?.rateBps : null;
  if (!code || !rate) return null;
  return (
    <p className="mt-2 text-center text-xs text-muted-foreground">
      The organizer pays promoters{" "}
      <span className="font-semibold text-foreground">
        {Number((rate / 100).toFixed(2))}%
      </span>{" "}
      of every ticket sold through their link, as credit after the event.
    </p>
  );
}
