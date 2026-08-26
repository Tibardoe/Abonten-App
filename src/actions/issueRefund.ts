"use server";

import { createClient } from "@/config/supabase/server";
import { refundTransaction } from "@/services/paystackService";

/**
 * Refunds a transaction via Paystack and marks it `refunded`. Takes only an
 * id (not a caller-supplied transaction object) and re-fetches + re-checks
 * ownership/status itself — this is a directly-callable Server Action, so it
 * can't trust that a caller already verified those things, even though
 * cancelUserTicket.ts (its only current caller) already did.
 */
export default async function issueRefund(transactionId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: transaction, error: transactionError } = await supabase
    .from("transaction")
    .select("id, status, paystack_reference")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (transactionError || !transaction) {
    console.log(
      `Failed fetching transaction for refund: ${transactionError?.message}`,
    );
    return { status: 404, message: "Transaction not found" };
  }

  if (transaction.status === "refunded") {
    return { status: 200, message: "This payment was already refunded" };
  }

  if (transaction.status === "refund_pending") {
    return {
      status: 200,
      message: "Your refund is already being processed by Paystack",
    };
  }

  if (transaction.status !== "successful") {
    return {
      status: 400,
      message: "Only successful payments can be refunded",
    };
  }

  if (!transaction.paystack_reference) {
    return { status: 400, message: "No payment reference on this transaction" };
  }

  try {
    await refundTransaction(transaction.paystack_reference);
  } catch (error) {
    console.log(`Refund failed for transaction ${transaction.id}: ${error}`);

    // Still record that a request was actually made — refund_requested_at
    // is what lets the UI tell "attempted and failed" apart from "not
    // requested yet" for a transaction stuck at status=successful.
    await supabase
      .from("transaction")
      .update({ refund_requested_at: new Date(), updated_at: new Date() })
      .eq("id", transaction.id)
      .is("refund_requested_at", null);

    return {
      status: 500,
      message: "Refund could not be processed. Please contact support.",
    };
  }

  // Paystack accepting the refund request doesn't mean the refund is
  // complete — it's asynchronous, the same way a charge is never trusted as
  // successful just because /transaction/initialize returned. The webhook's
  // refund.processed/refund.failed events (src/app/api/paystack/webhook/route.ts)
  // are what actually confirm completion and move this to `refunded`.
  //
  // record_refund_hold does the status transition AND the organizer ledger
  // deduction atomically in one Postgres function — the money is reserved
  // the instant Paystack accepts the request, not once it's confirmed, so
  // an organizer can never withdraw a settled event's earnings out from
  // under a refund that's merely in flight (see the migration that added
  // this function for the full reasoning).
  const { error: holdError } = await supabase.rpc("record_refund_hold", {
    p_transaction_id: transaction.id,
  });

  if (holdError) {
    console.log(
      `Failed recording refund hold for transaction ${transaction.id}: ${holdError.message}`,
    );
    return {
      status: 500,
      message:
        "Refund was requested but couldn't be recorded. Please contact support.",
    };
  }

  return {
    status: 200,
    message: "Refund requested — Paystack will confirm once it's processed",
  };
}
