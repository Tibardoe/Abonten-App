"use server";

import { createClient } from "@/config/supabase/server";
import { after } from "next/server";
import eventCancellationNotification, {
  type CancelledAttendeeRefund,
} from "./eventCancellationNotification";
import issueRefund from "./issueRefund";

type RefundableTransactionRow = {
  refund_transaction_id: string;
  attendee_user_id: string;
  paystack_reference: string | null;
  transaction_amount: number;
  transaction_currency: string;
  event_title: string;
};

/**
 * Cancels an event and, atomically, cancels every ticket/attendance/paid
 * checkout row tied to it and notifies every affected attendee — all done
 * inside the cancel_event_and_release_tickets RPC (SECURITY DEFINER, see
 * its migration for why: it needs to write ticket/attendance rows owned by
 * other users, and notification rows for other users, neither of which this
 * action's own session is allowed to touch under RLS).
 *
 * The RPC's status check ("must currently be draft/published") is the
 * idempotency guard — a duplicate/retried call always fails cleanly with
 * "already cancelled" instead of re-running any side effect, so no
 * duplicate refunds or notifications are possible from a double-click or a
 * retried request.
 *
 * The actual Paystack refund call happens here, after the RPC, over its
 * returned (deduplicated by transaction) list — issueRefund.ts is reused
 * unchanged and is itself idempotent, so a failure here never leaves the
 * system falsely claiming a refund succeeded, and is safe to retry.
 */
export default async function cancelEvent(eventId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not Logged in" };
  }

  const { data: refundable, error: rpcError } = await supabase.rpc(
    "cancel_event_and_release_tickets",
    { p_event_id: eventId },
  );

  if (rpcError) {
    console.log(`Error cancelling event: ${rpcError.message}`);

    if (rpcError.message?.includes("already cancelled")) {
      return {
        status: 409,
        message: "This event has already been cancelled.",
      };
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

  const refundResults = await Promise.allSettled(
    transactions.map((row) => issueRefund(row.refund_transaction_id)),
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

  if (transactions.length > 0) {
    const eventTitle = transactions[0].event_title;
    const attendees: CancelledAttendeeRefund[] = transactions.map((row) => ({
      userId: row.attendee_user_id,
      amount: row.transaction_amount,
      currency: row.transaction_currency,
    }));

    after(() =>
      eventCancellationNotification(eventTitle, attendees).catch((error) =>
        console.log(`Failed sending event cancellation emails: ${error}`),
      ),
    );
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
