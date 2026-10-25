"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseDiscoveryInput } from "@/utils/discoveryAction";
import { requireTicketPlanUser } from "@/utils/ticketPlanAction";
import { payTicketPlanPartCore } from "@abonten/services/ticketPlans/ticketPlanCore";
import { payTicketPlanPartSchema } from "@abonten/validation/ticketPlanSchemas";

/**
 * Starts the charge for one part of a plan. The provider's page returns to
 * the plan page, which verifies the payment (verifyPaystackPayment).
 */
export const payTicketPlanPart = withActionLocale(
  async function payTicketPlanPart(raw: unknown) {
    const caller = await requireTicketPlanUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(payTicketPlanPartSchema, raw);
    if (input.error) return input.error;
    return payTicketPlanPartCore(
      caller.supabase,
      caller.userId,
      caller.email,
      { ...input.data, platform: "web" },
      (planId, attemptId) =>
        `${process.env.NEXT_PUBLIC_BASE_URL}/ticket-plans/${planId}?attempt=${attemptId}`,
    );
  },
);
