"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { logger } from "@abonten/core/logger";
import { tr } from "@abonten/services/i18n/requestLocale";

export const getTickets = withActionLocale(async function getTickets(
  eventId: string,
) {
  const supabase = await createClient();

  const { data: tickets, error: ticketsError } = await supabase
    .from("ticket_type")
    .select("*")
    .eq("event_id", eventId);

  if (!tickets || ticketsError) {
    logger.error(`Error fetching tickets: ${ticketsError?.message}`);

    return {
      status: 500,
      message: tr("failedToLoadTicketsPleaseTry"),
    };
  }

  return { status: 200, tickets };
});
