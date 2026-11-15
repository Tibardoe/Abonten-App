"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type OrganizerFinanceOverviewResult,
  fetchOrganizerFinanceOverview,
} from "@abonten/services/organizer/organizerReadQuery";

/**
 * The single balance figure every surface reads — Finances Overview, the
 * Dashboard's lightweight finance summary, and Event Insights all call this
 * exact action/RPC (get_organizer_finance_overview), so the numbers shown
 * on each can never drift apart.
 */
export default withActionLocale(
  async function getOrganizerFinanceOverview(): Promise<OrganizerFinanceOverviewResult> {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return { status: 401, message: tr("userNotLoggedIn") };
    }

    // Managing as a team: the chosen team, if the person's role covers this.
    const actor = await actingFor(user.id, "money.view");
    if (actor.error) return actor.error;

    return fetchOrganizerFinanceOverview(supabase, actor.accountId);
  },
);
