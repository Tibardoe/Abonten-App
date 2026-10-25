"use server";

import { withActionLocale } from "@/i18n/withActionLocale";
import { requireTicketPlanUser } from "@/utils/ticketPlanAction";
import { getBalanceCore } from "@abonten/services/ticketPlans/ticketPlanCore";

/** The Balance page: money put towards tickets, the plans, and credit. */
export const getBalanceOverview = withActionLocale(
  async function getBalanceOverview() {
    const caller = await requireTicketPlanUser();
    if (caller.error) return caller.error;
    return getBalanceCore(caller.supabase, caller.userId);
  },
);
