"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseDiscoveryInput } from "@/utils/discoveryAction";
import { requireTicketPlanUser } from "@/utils/ticketPlanAction";
import { getTicketPlanCore } from "@abonten/services/ticketPlans/ticketPlanCore";
import { ticketPlanIdSchema } from "@abonten/validation/ticketPlanSchemas";

/** One of the person's plans, with its parts and what can happen next. */
export const getTicketPlan = withActionLocale(async function getTicketPlan(
  raw: unknown,
) {
  const caller = await requireTicketPlanUser();
  if (caller.error) return caller.error;
  const input = parseDiscoveryInput(ticketPlanIdSchema, raw);
  if (input.error) return input.error;
  return getTicketPlanCore(caller.userId, input.data.planId);
});
