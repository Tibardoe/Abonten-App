"use server";

import { createClient } from "@/config/supabase/server";
import { releasePromoUsage } from "@/utils/promoUsage";
import { releaseTicketQuantity } from "@/utils/ticketInventory";
import { revalidatePath } from "next/cache";
import issueRefund from "./issueRefund";

type TicketRow = {
  ticket_type_id: string;
  ticket_type: { event_id: string } | null;
};

export default async function cancelUserTicket(
  ticketId: string,
  transactionId: string | null,
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
    .select("ticket_type_id, ticket_type:ticket_type_id(event_id)")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ticketError || !rawTicket) {
    console.log(`Failed fetching ticket: ${ticketError?.message}`);
    return { status: 404, message: "Ticket not found" };
  }

  const ticket = rawTicket as unknown as TicketRow;
  const ticketTypeId = ticket.ticket_type_id;
  const eventId = ticket.ticket_type?.event_id;

  if (transactionId) {
    const { data: transaction, error: transactionError } = await supabase
      .from("transaction")
      .select("*")
      .eq("id", transactionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (transactionError || !transaction) {
      console.log(`Failed fetching transaction: ${transactionError?.message}`);

      return { status: 500, message: "Something went wrong!" };
    }

    if (transaction.amount > 0) {
      const response = await issueRefund(transaction);

      if (response.status !== 200) {
        console.log(response.message);
      }
    }
  }

  const { error: updateStatusError } = await supabase
    .from("ticket")
    .update({ status: "cancelled", updated_at: new Date() })
    .eq("id", ticketId)
    .eq("user_id", user.id);

  if (updateStatusError) {
    console.log(`Error updating ticket status:${updateStatusError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  // State-based, not a delete: the attendance row for this exact ticket
  // (one row per ticket — see insertUserAttendance) is marked cancelled so
  // attendance_count queries (which filter status = 'attending') stop
  // counting it, while keeping the row for any future audit/history need.
  const { error: updateAttendanceError } = await supabase
    .from("attendance")
    .update({ status: "cancelled" })
    .eq("ticket_id", ticketId)
    .eq("user_id", user.id);

  if (updateAttendanceError) {
    console.log(
      `Error updating user attendance: ${updateAttendanceError.message}`,
    );

    return { status: 500, message: "Something went wrong!" };
  }

  await releaseTicketQuantity(ticketTypeId, 1);

  // A promo code should only count as "used" while the purchase it was
  // applied to is still active. Only release it once this was the user's
  // LAST active ticket for the event — validateCheckout's "already bought"
  // gate already treats any remaining active ticket as blocking a repeat
  // checkout, so releasing earlier would let a promo be reapplied while the
  // user still holds an active ticket for this event.
  if (eventId) {
    await releasePromoUsageIfEventFullyCancelled(supabase, user.id, eventId);
  }

  // Server-side, so this fires regardless of which UI called this action —
  // the "My Tickets" list depends on this ticket's now-updated status, and
  // the organizer's attendance dashboard depends on it too (previously this
  // cancellation never invalidated the organizer's view at all).
  revalidatePath("/manage/my-events");
  revalidatePath("/manage/attendance/attendance-list");
  revalidatePath("/manage/dashboard");

  return { status: 200, message: "Ticket cancelled successfully" };
}

async function releasePromoUsageIfEventFullyCancelled(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  eventId: string,
) {
  // Same shape as the "already bought" check in validateCheckout.ts/
  // registerForFreeEvent.ts: fetch the user's active tickets with their
  // event id embedded, then filter in JS, rather than relying on PostgREST
  // dot-notation filtering on an embedded column.
  const { data: rawActiveTickets, error: remainingTicketsError } =
    await supabase
      .from("ticket")
      .select("id, status, ticket_type_id(event_id)")
      .eq("user_id", userId)
      .eq("status", "active");

  if (remainingTicketsError) {
    console.log(
      `Failed checking remaining tickets: ${remainingTicketsError.message}`,
    );
    return;
  }

  const remainingActiveTickets = (
    (rawActiveTickets ?? []) as unknown as {
      ticket_type_id: { event_id: string };
    }[]
  ).filter((t) => t.ticket_type_id.event_id === eventId);

  if (remainingActiveTickets.length > 0) return;

  const { data: promoUsage, error: promoUsageError } = await supabase
    .from("promo_code_usage")
    .select("promo_code_id")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (promoUsageError) {
    console.log(`Failed checking promo usage: ${promoUsageError.message}`);
    return;
  }

  if (!promoUsage) return;

  const { data: paidCheckouts, error: paidCheckoutsError } = await supabase
    .from("ticket_checkout")
    .select("discounted_units")
    .eq("user_id", userId)
    .eq("event_id", eventId)
    .eq("status", "paid")
    .not("promo_code", "is", null);

  if (paidCheckoutsError) {
    console.log(
      `Failed reading paid checkout discount units: ${paidCheckoutsError.message}`,
    );
    return;
  }

  const totalDiscountedUnits = (paidCheckouts ?? []).reduce(
    (sum, row) => sum + (row.discounted_units ?? 0),
    0,
  );

  await releasePromoUsage(
    promoUsage.promo_code_id,
    userId,
    eventId,
    // Even a fully-discounted purchase claimed at least one unit of usage;
    // fall back to 1 so the usage row is always released.
    Math.max(1, totalDiscountedUnits),
  );
}
