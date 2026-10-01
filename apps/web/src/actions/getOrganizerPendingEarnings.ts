"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import type { OrganizerPendingEarningRow } from "@abonten/types/organizerFinance";

type GetOrganizerPendingEarningsResult =
  | { status: 401 | 500; message: string }
  | { status: 200; data: OrganizerPendingEarningRow[] };

/**
 * Pending earnings broken out by event, for Finances Overview's "Pending
 * earnings" list — every row is traceable back to the event that produced
 * it (get_organizer_pending_earnings groups by event_id).
 */
export default withActionLocale(
  async function getOrganizerPendingEarnings(): Promise<GetOrganizerPendingEarningsResult> {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return { status: 401, message: tr("userNotLoggedIn") };
    }

    const { data, error } = await supabase.rpc(
      "get_organizer_pending_earnings",
    );

    if (error) {
      logger.error(`Failed fetching pending earnings: ${error.message}`);
      return { status: 500, message: tr("somethingWentWrong") };
    }

    return {
      status: 200,
      data: (data ?? []) as OrganizerPendingEarningRow[],
    };
  },
);
