"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { parseDiscoveryInput } from "@/utils/discoveryAction";
import { getTicketPlanOfferCore } from "@abonten/services/ticketPlans/ticketPlanCore";
import { ticketPlanOfferSchema } from "@abonten/validation/ticketPlanSchemas";

/**
 * Whether this event can be paid small small for the visitor, and on what
 * terms. Works signed out (the offer is shown; starting needs an account).
 */
export const getTicketPlanOffer = withActionLocale(
  async function getTicketPlanOffer(raw: unknown) {
    const input = parseDiscoveryInput(ticketPlanOfferSchema, raw);
    if (input.error) return input.error;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return getTicketPlanOfferCore(user?.id ?? null, input.data);
  },
);
