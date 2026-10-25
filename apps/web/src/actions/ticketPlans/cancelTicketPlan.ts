"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseDiscoveryInput } from "@/utils/discoveryAction";
import { requireTicketPlanUser } from "@/utils/ticketPlanAction";
import { cancelTicketPlanCore } from "@abonten/services/ticketPlans/ticketPlanCore";
import { ticketPlanIdSchema } from "@abonten/validation/ticketPlanSchemas";

/** Ends the person's own unfinished plan, with its refund. */
export const cancelTicketPlan = withActionLocale(
  async function cancelTicketPlan(raw: unknown) {
    const caller = await requireTicketPlanUser();
    if (caller.error) return caller.error;
    const input = parseDiscoveryInput(ticketPlanIdSchema, raw);
    if (input.error) return input.error;
    return cancelTicketPlanCore(caller.userId, input.data.planId);
  },
);
