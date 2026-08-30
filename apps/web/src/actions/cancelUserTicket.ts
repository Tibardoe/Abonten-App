"use server";

import { createClient } from "@/config/supabase/server";
import { releasePromoUsage } from "@/utils/promoUsage";
import { releaseTicketQuantity } from "@/utils/ticketInventory";
import { logger } from "@abonten/core/logger";
import { revalidatePath } from "next/cache";
import issueRefund from "./issueRefund";

type TicketRow = {
  ticket_type_id: string;
  ticket_checkout_id: string | null;
  ticket_type: {
    event_id: string;
    event: { event_code: string } | null;
  } | null;
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
    .select(
      "ticket_type_id, ticket_checkout_id, ticket_type:ticket_type_id(event_id, event:event_id(event_code))",
    )
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ticketError || !rawTicket) {
    logger.error(`Failed fetching ticket: ${ticketError?.message}`);
    return { status: 404, message: "Ticket not found" };
  }

  const ticket = rawTicket as unknown as TicketRow;
  const ticketTypeId = ticket.ticket_type_id;
  const eventId = ticket.ticket_type?.event_id;

  const { error: updateStatusError } = await supabase
    .from("ticket")
    .update({ status: "cancelled", updated_at: new Date() })
    .eq("id", ticketId)
    .eq("user_id", user.id);

  if (updateStatusError) {
    logger.error(`Error updating ticket status:${updateStatusError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  let refundMessage: string | null = null;
  let refundDeferred = false;

  if (transactionId) {
    const { data: transaction, error: transactionError } = await supabase
      .from("transaction")
      .select("id, amount")
      .eq("id", transactionId)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; amount: number }>();

    if (transactionError || !transaction) {
      logger.error(`Failed fetching transaction: ${transactionError?.message}`);

      return { status: 500, message: "Something went wrong!" };
    }

    if (transaction.amount > 0) {
      // A single Paystack charge (transaction) can cover multiple tickets —
      // every ticket, quantity, and even every event in a multi-checkout
      // group shares one transaction_id (see generateTicket.ts) — and this
      // integration's refund call has no partial-amount option (see
      // paystackService.refundTransaction), so it always refunds the WHOLE
      // transaction. Requesting it here unconditionally would refund the
      // entire order's payment while sibling tickets from the same order are
      // still active and unrefunded-looking. Instead, only request the
      // refund once THIS cancellation makes every ticket sharing this
      // transaction cancelled — mirroring how markCheckoutCancelledIfAllTicketsCancelled
      // already gates ticket_checkout.status the same way, one level up.
      const allCancelled = await areAllTicketsForTransactionCancelled(
        supabase,
        transaction.id,
      );

      if (allCancelled) {
        const response = await issueRefund(transaction.id);

        if (response.status === 200) {
          refundMessage = response.message;
        }
      } else {
        refundDeferred = true;
      }
    }
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
    logger.error(
      `Error updating user attendance: ${updateAttendanceError.message}`,
    );

    return { status: 500, message: "Something went wrong!" };
  }

  if (ticket.ticket_checkout_id) {
    await markCheckoutCancelledIfAllTicketsCancelled(
      supabase,
      ticket.ticket_checkout_id,
    );
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
  if (eventId) {
    revalidatePath(`/manage/events/${eventId}`);
  }
  revalidatePath("/manage/dashboard");
  revalidatePath("/transactions");
  // See generateTicket.ts for why the public event page also needs this —
  // cancelling restores a spot, and that must be visible without a refresh.
  const eventCode = ticket.ticket_type?.event?.event_code;
  if (eventCode) {
    revalidatePath(`/events/${eventCode.toLowerCase()}`);
  }

  return {
    status: 200,
    message: refundMessage
      ? `Ticket cancelled. ${refundMessage}.`
      : refundDeferred
        ? "Ticket cancelled. The refund for this order will be requested once every ticket in it is cancelled."
        : "Ticket cancelled successfully",
  };
}

// Checks whether every ticket sharing this transaction (across every
// checkout line and, for a multi-event checkout, every event it covers) is
// now cancelled — the gate for actually requesting a refund, since Paystack
// refunds this integration issues are always for the transaction's full
// amount, never a per-ticket partial amount.
async function areAllTicketsForTransactionCancelled(
  supabase: Awaited<ReturnType<typeof createClient>>,
  transactionId: string,
) {
  const { data: siblingTickets, error: siblingTicketsError } = await supabase
    .from("ticket")
    .select("status")
    .eq("transaction_id", transactionId);

  if (siblingTicketsError) {
    logger.error(
      `Failed checking sibling tickets for transaction ${transactionId}: ${siblingTicketsError.message}`,
    );
    // Fail closed: if this can't be verified, don't risk refunding a still-
    // partly-active order.
    return false;
  }

  return (siblingTickets ?? []).every((t) => t.status === "cancelled");
}

// A ticket_checkout row can cover multiple tickets (quantity > 1) — only
// flip its status to 'cancelled' once every ticket it produced is
// cancelled, so /transactions doesn't show a whole purchase as cancelled
// when only some of its tickets actually are. Partial cancellations are
// left as 'paid' and reflected instead via get_user_transaction_history's
// cancelled_quantity/refund_status columns.
async function markCheckoutCancelledIfAllTicketsCancelled(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticketCheckoutId: string,
) {
  const { data: siblingTickets, error: siblingTicketsError } = await supabase
    .from("ticket")
    .select("status")
    .eq("ticket_checkout_id", ticketCheckoutId);

  if (siblingTicketsError) {
    logger.error(
      `Failed checking sibling tickets for checkout ${ticketCheckoutId}: ${siblingTicketsError.message}`,
    );
    return;
  }

  const allCancelled = (siblingTickets ?? []).every(
    (t) => t.status === "cancelled",
  );

  if (!allCancelled) return;

  const { error: checkoutUpdateError } = await supabase
    .from("ticket_checkout")
    .update({ status: "cancelled" })
    .eq("id", ticketCheckoutId)
    .eq("status", "paid");

  if (checkoutUpdateError) {
    logger.error(
      `Failed marking checkout ${ticketCheckoutId} cancelled: ${checkoutUpdateError.message}`,
    );
  }
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
      // 'used' (checked in) is still a valid, non-cancelled ticket -- same
      // reasoning as validateCheckout.ts/registerForFreeEvent.ts's
      // "already bought" check.
      .in("status", ["active", "used"]);

  if (remainingTicketsError) {
    logger.error(
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
    logger.error(`Failed checking promo usage: ${promoUsageError.message}`);
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
    logger.error(
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
