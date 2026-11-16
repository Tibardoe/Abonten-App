"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { getEventPromoterOfferCore } from "@abonten/services/rewards/promoterCommissionCore";
import type { EventPromoterOffer } from "@abonten/types/rewards";

/**
 * The commission a sharer earns on this event (null when there isn't one or
 * commissions aren't live for the caller) -- for the "share and earn" hint.
 */
export const getEventPromoterOffer = withActionLocale(
  async function getEventPromoterOffer(
    eventId: string,
  ): Promise<{ status: number; data?: EventPromoterOffer | null }> {
    if (typeof eventId !== "string") return { status: 400 };
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Nobody is offered a share of an event they run, unless an Owner added
    // them as a promoter (X36); an invited-only event offers its list only.
    return getEventPromoterOfferCore(supabase, eventId, user?.id ?? null);
  },
);
