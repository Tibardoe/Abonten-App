"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { actingFor } from "@/utils/teamActor";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";
import { accountArg } from "@abonten/services/teams/accountArg";

export default withActionLocale(async function getEventSalesTimeline(
  eventId: string,
) {
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

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", actor.accountId)
    .maybeSingle();

  if (eventError || !event) {
    return {
      status: 403,
      message: tr("notAuthorizedToViewThisEvent"),
    };
  }

  const { data, error } = await supabase.rpc("get_event_sales_timeline", {
    p_event_id: eventId,
    ...accountArg(actor.accountId),
  });

  if (error) {
    logger.error("Supabase error:", error.message);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  return { status: 200, data: data ?? [] };
});
