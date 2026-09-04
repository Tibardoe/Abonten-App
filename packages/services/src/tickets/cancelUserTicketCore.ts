import { logger } from "@abonten/core/logger";
import { releasePromoUsage } from "@abonten/services/checkout/promoUsage";
import { releaseTicketQuantity } from "@abonten/services/checkout/ticketInventory";
import { issueRefundCore } from "@abonten/services/organizer/issueRefundCore";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of cancelUserTicket, lifted so the mobile API route
// (`/api/mobile/tickets/cancel`) and the "use server" action run the exact
// same cancellation + refund gating. Caller supplies an already-
// authenticated Supabase client + resolved userId. `revalidatePath` stays
// in the web wrapper (it returns eventId/eventCode for that). Deliberately
// NOT a "use server" file (see validateCheckoutCore.ts).

type TicketRow = {
  status: string;
  ticket_type_id: string;
  ticket_checkout_id: string | null;
  ticket_type: {
    event_id: string;
    event: { event_code: string } | null;
  } | null;
};

export type CancelUserTicketCoreResult = {
  status: number;
  message: string;
  eventId?: string;
  eventCode?: string;
};

export async function cancelUserTicketCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  ticketId: string,
  transactionId: string | null,
): Promise<CancelUserTicketCoreResult> {
  const { data: rawTicket, error: ticketError } = await supabase
    .from("ticket")
    .select(
      "status, ticket_type_id, ticket_checkout_id, ticket_type:ticket_type_id(event_id, event:event_id(event_code))",
    )
    .eq("id", ticketId)
    .eq("user_id", userId)
    .maybeSingle();

  if (ticketError || !rawTicket) {
    logger.error(`Failed fetching ticket: ${ticketError?.message}`);
    return { status: 404, message: "Ticket not found" };
  }

  const ticket = rawTicket as unknown as TicketRow;
  const ticketTypeId = ticket.ticket_type_id;
  const eventId = ticket.ticket_type?.event_id;
  const eventCode = ticket.ticket_type?.event?.event_code;

  // Idempotency guard: this whole function releases a real reserved
  // inventory unit and (conditionally) requests a real refund — neither of
  // which is safe to repeat. Without this, a retried call (a client-side
  // network retry hitting the server twice, say) on an already-cancelled
  // ticket would call releaseTicketQuantity a second time (inflating
  // available inventory with a phantom seat) even though issueRefundCore
  // itself is separately guarded against a double refund.
  if (ticket.status === "cancelled") {
    return {
      status: 200,
      message: "Ticket cancelled successfully",
      eventId: eventId ?? undefined,
      eventCode: eventCode ?? undefined,
    };
  }

  const { error: updateStatusError } = await supabase
    .from("ticket")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", ticketId)
    .eq("user_id", userId);

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
      .eq("user_id", userId)
      .maybeSingle<{ id: string; amount: number }>();

    if (transactionError || !transaction) {
      logger.error(`Failed fetching transaction: ${transactionError?.message}`);
      return { status: 500, message: "Something went wrong!" };
    }

    if (transaction.amount > 0) {
      // A single Paystack charge (transaction) can cover multiple tickets —
      // every ticket, quantity, and even every event in a multi-checkout
      // group shares one transaction_id (see generateTicket.ts). The refund
      // (issueRefundCore) is a partial refund of the ticket revenue only,
      // but it still targets the whole order's ticket revenue, so it must
      // only fire once THIS cancellation makes every ticket sharing this
      // transaction cancelled — mirroring markCheckoutCancelledIfAllTicketsCancelled
      // one level up.
      const allCancelled = await areAllTicketsForTransactionCancelled(
        supabase,
        transaction.id,
      );

      if (allCancelled) {
        const response = await issueRefundCore(supabase, transaction.id, {
          expectedUserId: userId,
        });

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
    .eq("user_id", userId);

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
  // LAST active ticket for the event.
  if (eventId) {
    await releasePromoUsageIfEventFullyCancelled(supabase, userId, eventId);
  }

  return {
    status: 200,
    message: refundMessage
      ? `Ticket cancelled. ${refundMessage}.`
      : refundDeferred
        ? "Ticket cancelled. The refund for this order will be requested once every ticket in it is cancelled."
        : "Ticket cancelled successfully",
    eventId: eventId ?? undefined,
    eventCode: eventCode ?? undefined,
  };
}

// Checks whether every ticket sharing this transaction (across every
// checkout line and, for a multi-event checkout, every event it covers) is
// now cancelled — the gate for actually requesting a refund.
async function areAllTicketsForTransactionCancelled(
  supabase: SupabaseClient<Database>,
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
// when only some of its tickets actually are.
async function markCheckoutCancelledIfAllTicketsCancelled(
  supabase: SupabaseClient<Database>,
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
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
) {
  const { data: rawActiveTickets, error: remainingTicketsError } =
    await supabase
      .from("ticket")
      .select("id, status, ticket_type_id(event_id)")
      // 'used' (checked in) is still a valid, non-cancelled ticket.
      .eq("user_id", userId)
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
    // Even a fully-discounted purchase claimed at least one unit of usage.
    Math.max(1, totalDiscountedUnits),
    supabase,
  );
}
