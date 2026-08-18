"use server";

import { createClient } from "@/config/supabase/server";
import type { AuthOverride } from "@/types/authOverrideType";
import type { UserTicketType } from "@/types/ticketType";
import { TICKET_WITH_EVENT_SELECT } from "@/utils/ticketSelect";

/**
 * Fetches specific tickets, in the exact same shape getUserAttendingEvents
 * produces for "My Events" — so the ticket-purchase email attachment is
 * built from the same data as the download-from-My-Events PDF, not a
 * separately-fetched (and possibly diverging) copy.
 *
 * `authOverride` lets a caller that already resolved the user server-side
 * with its own client (e.g. the Paystack webhook, which has no cookies to
 * derive a session from) reuse this same logic instead of duplicating it.
 * Every existing call site omits it and keeps today's cookie-based behavior
 * exactly as-is.
 */
export default async function getTicketsByIds(
  ticketIds: string[],
  authOverride?: AuthOverride,
): Promise<{ status: number; data: UserTicketType[]; message?: string }> {
  if (ticketIds.length === 0) {
    return { status: 400, data: [], message: "No ticket ids provided" };
  }

  const supabase = authOverride?.supabase ?? (await createClient());

  let userId: string;

  if (authOverride) {
    userId = authOverride.userId;
  } else {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.log(`Failed fetching user: ${userError?.message}`);
      return { status: 401, data: [], message: "User not logged in" };
    }

    userId = user.id;
  }

  const { data: tickets, error: ticketsError } = await supabase
    .from("ticket")
    .select(TICKET_WITH_EVENT_SELECT)
    .eq("user_id", userId)
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
