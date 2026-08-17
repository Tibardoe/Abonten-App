"use server";

import { createClient } from "@/config/supabase/server";
import type { UserTicketType } from "@/types/ticketType";
import { TICKET_WITH_EVENT_SELECT } from "@/utils/ticketSelect";

/**
 * Fetches specific tickets, in the exact same shape getUserAttendingEvents
 * produces for "My Events" — so the ticket-purchase email attachment is
 * built from the same data as the download-from-My-Events PDF, not a
 * separately-fetched (and possibly diverging) copy.
 */
export default async function getTicketsByIds(
  ticketIds: string[],
): Promise<{ status: number; data: UserTicketType[]; message?: string }> {
  if (ticketIds.length === 0) {
    return { status: 400, data: [], message: "No ticket ids provided" };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.log(`Failed fetching user: ${userError?.message}`);
    return { status: 401, data: [], message: "User not logged in" };
  }

  const { data: tickets, error: ticketsError } = await supabase
    .from("ticket")
    .select(TICKET_WITH_EVENT_SELECT)
    .eq("user_id", user.id)
    .in("id", ticketIds);

  if (ticketsError) {
    console.log(`Failed fetching tickets: ${ticketsError.message}`);
    return { status: 500, data: [], message: "Something went wrong" };
  }

  const ticketsWithEvents = (
    tickets as unknown as (UserTicketType & {
      ticket_type: { event: UserTicketType["event"] };
    })[]
  ).map((ticket) => ({
    ...ticket,
    event: ticket.ticket_type.event,
  }));

  return { status: 200, data: ticketsWithEvents };
}
