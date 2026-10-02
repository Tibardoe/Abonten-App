"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";

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

  const { data: event, error: eventError } = await supabase
    .from("event")
    .select("id")
    .eq("id", eventId)
    .eq("organizer_id", user.id)
    .maybeSingle();

  if (eventError || !event) {
    return {
      status: 403,
      message: tr("notAuthorizedToViewThisEvent"),
    };
  }

  const { data, error } = await supabase.rpc("get_event_sales_timeline", {
    p_event_id: eventId,
  });

  if (error) {
    logger.error("Supabase error:", error.message);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  return { status: 200, data: data ?? [] };
});
