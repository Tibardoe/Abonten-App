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

  // The event's automatic group prices, for the live preview (the server
  // prices the order itself at checkout).
  const { data: groupRows, error: groupError } = await supabase
    .from("event_group_discount")
    .select("min_tickets, percent_off")
    .eq("event_id", eventId);

  if (groupError) {
    logger.error(`Error fetching group prices: ${groupError.message}`);

    return {
      status: 500,
      message: tr("failedToLoadTicketsPleaseTry"),
    };
  }

  const groupDiscounts = (groupRows ?? []).map((row) => ({
    minTickets: row.min_tickets,
    percentOff: row.percent_off,
  }));

  return { status: 200, tickets, groupDiscounts };
});
