"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { parseDiscoveryInput } from "@/utils/discoveryAction";
import { referralHintsFromCookie } from "@/utils/referralHintsFromCookie";
import { requireTicketPlanUser } from "@/utils/ticketPlanAction";
import { startTicketPlanCore } from "@abonten/services/ticketPlans/ticketPlanCore";
import { startTicketPlanSchema } from "@abonten/validation/ticketPlanSchemas";

/** Locks the price and holds the seats; the first part is paid next. */
export const startTicketPlan = withActionLocale(async function startTicketPlan(
  raw: unknown,
) {
  const caller = await requireTicketPlanUser();
  if (caller.error) return caller.error;
  const input = parseDiscoveryInput(startTicketPlanSchema, raw);
  if (input.error) return input.error;
  const { hints } = await referralHintsFromCookie();
  return startTicketPlanCore(caller.userId, {
    ...input.data,
    referralHints: hints,
  });
});
