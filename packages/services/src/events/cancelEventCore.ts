import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import { issueRefundCore } from "../organizer/issueRefundCore";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Post-auth bodies of getEventCancellationImpact + cancelEvent, shared by
// the Server Actions (cookie session) and the mobile HTTP routes (Bearer
// session). Both receive an already-authenticated `supabase` client. The
// two RPCs (get_event_cancellation_impact, cancel_event_and_release_tickets)
// are SECURITY DEFINER and both verify `event.organizer_id = auth.uid()`
// themselves, so ownership is proven server-side regardless of transport —
// no logic fork. The Paystack refunds afterward run on a service-role
// client because the transactions belong to the *attendees*, not the
// organizer, and are idempotent + safe to retry (see cancelEvent's original
// header for the full rationale). `revalidatePath` and the attendee
// cancellation emails (React templates + Resend) are Next-/apps/web-specific:
// the caller passes `onRefundsInitiated`, which the web wrapper schedules
// via next/server `after`.

export type CancelledAttendeeRefund = {
  userId: string;
  amount: number;
  currency: string;
};

export type EventCancellationImpact = {
  paidTicketCount: number;
  freeTicketCount: number;
  attendeeCount: number;
};

type EventCancellationImpactRow = {
  paid_ticket_count: number;
  free_ticket_count: number;
  attendee_count: number;
};

export type EventCancellationImpactResult =
  | { status: 403 | 404 | 500; message: string }
  | { status: 200; data: EventCancellationImpact };

export type CancelEventResult =
  | { status: 403 | 409 | 500; message: string }
  | {
      status: 200;
      message: string;
      data: { refundsInitiated: number; refundsFailedToStart: number };
    };

type RefundableTransactionRow = {
  refund_transaction_id: string;
  attendee_user_id: string;
  paystack_reference: string | null;
  transaction_amount: number;
  transaction_currency: string;
  event_title: string;
};

export async function getEventCancellationImpactCore(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventCancellationImpactResult> {
  const { data, error } = await supabase
    .rpc("get_event_cancellation_impact", { p_event_id: eventId })
    .maybeSingle();

  if (error) {
    logger.error(`Error fetching event cancellation impact: ${error.message}`);
    const notOwned = error.message?.includes("not owned");
    return {
      status: notOwned ? 403 : 500,
      message: notOwned
        ? "Not authorized to view this event"
        : "Could not load cancellation details. Please try again.",
    };
  }

  if (!data) {
    return { status: 404, message: "Event not found" };
  }

  const row = data as unknown as EventCancellationImpactRow;

  return {
    status: 200,
    data: {
      paidTicketCount: row.paid_ticket_count,
      freeTicketCount: row.free_ticket_count,
      attendeeCount: row.attendee_count,
    },
  };
}

export async function cancelEventCore(
  supabase: SupabaseClient,
  eventId: string,
  onRefundsInitiated?: (
    eventTitle: string,
    attendees: CancelledAttendeeRefund[],
  ) => void,
): Promise<CancelEventResult> {
  const { data: refundable, error: rpcError } = await supabase.rpc(
    "cancel_event_and_release_tickets",
    { p_event_id: eventId },
  );

  if (rpcError) {
    logger.error(`Error cancelling event: ${rpcError.message}`);

    if (rpcError.message?.includes("already cancelled")) {
      return { status: 409, message: "This event has already been cancelled." };
    }
    if (rpcError.message?.includes("not owned")) {
      return { status: 403, message: "Not authorized to cancel this event" };
    }
    if (rpcError.message?.includes("cannot be cancelled")) {
      return { status: 409, message: "This event can't be cancelled." };
    }

    return {
      status: 500,
      message:
        "We couldn't cancel this event right now. No refunds have been issued yet.",
    };
  }

  const transactions = (refundable ?? []) as RefundableTransactionRow[];

  const serviceClient = getSupabaseServiceClient();
  const refundResults = await Promise.allSettled(
    transactions.map((row) =>
      issueRefundCore(serviceClient, row.refund_transaction_id),
    ),
  );

  let refundsInitiated = 0;
  let refundsFailedToStart = 0;

  for (const result of refundResults) {
    if (result.status === "fulfilled" && result.value.status === 200) {
      refundsInitiated += 1;
    } else {
      refundsFailedToStart += 1;
    }
  }

  if (transactions.length > 0 && onRefundsInitiated) {
    const eventTitle = transactions[0].event_title;
    const attendees: CancelledAttendeeRefund[] = transactions.map((row) => ({
      userId: row.attendee_user_id,
      amount: row.transaction_amount,
      currency: row.transaction_currency,
    }));

    onRefundsInitiated(eventTitle, attendees);
  }

  const message =
    refundsFailedToStart > 0
      ? `Event cancelled. ${refundsInitiated} refund(s) started, but ${refundsFailedToStart} couldn't be started and will need a manual retry.`
      : refundsInitiated > 0
        ? `Event cancelled. ${refundsInitiated} refund(s) have been started.`
        : "Event cancelled successfully.";

  return {
    status: 200,
    message,
    data: { refundsInitiated, refundsFailedToStart },
  };
}
