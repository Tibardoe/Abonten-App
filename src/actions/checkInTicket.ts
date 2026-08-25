"use server";

import { createClient } from "@/config/supabase/server";
import { revalidatePath } from "next/cache";

type TicketRow = {
  status: string;
  ticket_type: {
    event: { id: string; organizer_id: string } | null;
  } | null;
};

// The only place ticket.status ever moves to/from 'used' — every other
// transition (active -> cancelled) stays in cancelUserTicket.ts. This is the
// single source of "verified attendance" that postEventReview.ts /
// getEventReviewEligibility.ts gate reviews on, for both paid and free
// events (both create a ticket row — see generateTicket.ts /
// registerForFreeEvent.ts), instead of a separate attendance-verification
// system. checkedIn=false lets an organizer undo a mis-tap.
export default async function checkInTicket(
  ticketId: string,
  checkedIn: boolean,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: rawTicket, error: ticketError } = await supabase
    .from("ticket")
    .select(
      "status, ticket_type:ticket_type_id(event:event_id(id, organizer_id))",
    )
    .eq("id", ticketId)
    .maybeSingle();

  if (ticketError || !rawTicket) {
    return { status: 404, message: "Ticket not found" };
  }

  const ticket = rawTicket as unknown as TicketRow;
  const organizerId = ticket.ticket_type?.event?.organizer_id;

  if (!organizerId || organizerId !== user.id) {
    return { status: 403, message: "Not authorized to check in this ticket" };
  }

  if (checkedIn && ticket.status !== "active") {
    return {
      status: 400,
      message:
        ticket.status === "used"
          ? "This ticket is already checked in."
          : "Only active tickets can be checked in.",
    };
  }

  if (!checkedIn && ticket.status !== "used") {
    return { status: 400, message: "This ticket isn't checked in." };
  }

  const { error: updateError } = await supabase
    .from("ticket")
    .update({
      status: checkedIn ? "used" : "active",
      used_at: checkedIn ? new Date() : null,
      updated_at: new Date(),
    })
    .eq("id", ticketId);

  if (updateError) {
    console.log(
      `Error updating ticket check-in status: ${updateError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  const eventId = ticket.ticket_type?.event?.id;
  if (eventId) {
    revalidatePath(`/manage/events/${eventId}`);
  }

  return {
    status: 200,
    message: checkedIn ? "Checked in successfully" : "Check-in undone",
  };
}
