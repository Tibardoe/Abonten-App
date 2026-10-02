"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import type { OrganizerRefundSummaryRow } from "@abonten/types/organizerFinance";

type GetOrganizerRefundSummaryResult =
  | { status: 401 | 500; message: string }
  | { status: 200; data: OrganizerRefundSummaryRow[] };

/**
 * Organizer-wide pending/completed refund totals for the Finances Overview
 * "Refunds" section — mirrors getEventFinanceSummary.ts's event-scoped
 * breakdown but without the event filter (get_organizer_refund_breakdown).
 */
export default withActionLocale(
  async function getOrganizerRefundSummary(): Promise<GetOrganizerRefundSummaryResult> {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return { status: 401, message: tr("userNotLoggedIn") };
    }

    const { data, error } = await supabase.rpc(
      "get_organizer_refund_breakdown",
    );

    if (error) {
      logger.error(
        `Failed fetching organizer refund summary: ${error.message}`,
      );
      return { status: 500, message: tr("somethingWentWrong") };
    }

    return {
      status: 200,
      data: (data ?? []) as OrganizerRefundSummaryRow[],
    };
  },
);
