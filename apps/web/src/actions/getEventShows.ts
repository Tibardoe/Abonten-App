"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";

/**
 * The upcoming shows of the run an event belongs to (empty when it is not
 * in a run). A public read (get_event_shows); used by Manage › Details.
 */
export default withActionLocale(async function getEventShows(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_event_shows", {
    p_event_id: eventId,
  });
  if (error) {
    logger.error(`getEventShows failed: ${error.message}`);
    return { status: 500 as const, message: tr("somethingWentWrong") };
  }
  return { status: 200 as const, data: data ?? [] };
});
