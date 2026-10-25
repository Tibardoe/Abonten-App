"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import { getTicketPlanNavCore } from "@abonten/services/ticketPlans/ticketPlanProgram";
import { DISABLED_TICKET_PLAN_NAV } from "@abonten/types/ticketPlanType";

/** Whether the header shows Balance: plans open to the visitor, or running. */
export const getTicketPlanNav = withActionLocale(
  async function getTicketPlanNav() {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 200, data: DISABLED_TICKET_PLAN_NAV };
    try {
      return await getTicketPlanNavCore(getSupabaseServiceClient(), user.id);
    } catch {
      return { status: 200, data: DISABLED_TICKET_PLAN_NAV };
    }
  },
);
