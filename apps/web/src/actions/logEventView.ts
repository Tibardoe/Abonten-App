"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { normalizeLinkSource } from "@abonten/core/social/linkSources";
import { tr } from "@abonten/services/i18n/requestLocale";

// One opening of an event's page on the website (event_analytics_event).
// No sign-in needed: signed-out visitors count too. The cookie session goes
// with the insert when there is one, so the database can leave out the
// organizer's own views; the row keeps no account id. The database stamps
// the time and drops rows past 60 a minute per event. `source` is the link
// tag (@abonten/core/social/linkSources) when the visitor followed one of
// Abonten's own posts.
export const logEventView = withActionLocale(async function logEventView(
  eventId: string,
  source?: string | null,
) {
  const supabase = await createClient();

  const { error } = await supabase.from("event_analytics_event").insert({
    event_id: eventId,
    event_type: "view",
    platform: "web",
    // The ?src= of an Abonten link the visitor followed; unknown values drop.
    source: normalizeLinkSource(source),
  });

  if (error) {
    logger.error(`Error logging an event view: ${error.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  return { status: 200 };
});
