// The refund pipeline, factored out of the issueRefund.ts Server Action so
// it can run from two trust contexts without duplicating logic — same
// pattern as finalizePaystackPayment.ts:
//   - issueRefund.ts (buyer's own cookie session) passes expectedUserId so
//     the transaction fetch is scoped to the caller.
//   - cancelEvent.ts (organizer's session) passes a service-role client and
//     no expectedUserId: the cancel_event_and_release_tickets RPC already
//     verified event ownership and returned only that event's refundable
//     transactions, so identity is proven before this runs (the same
//     "identity already proven" precedent serviceClient.ts documents).
//
// Not a "use server" file — it takes an already-constructed Supabase client.

import { logger } from "@abonten/core/logger";
import { toPesewas } from "@abonten/core/paystackAmount";
import { refundTransaction } from "@abonten/services/payments/gateway/paystackService";
import type { SupabaseClient } from "@supabase/supabase-js";

export type IssueRefundResult = {
  status: 200 | 400 | 404 | 500;
  message: string;
};

/**
 * Requests a partial Paystack refund of the ticket revenue only (the
 * customer-paid Abonten service fee is retained) and records the organizer-
 * ledger hold + fee audit row. Idempotent: re-checks transaction.status
 * before doing anything, so a retry never double-refunds.
 */
export async function issueRefundCore(
  supabase: SupabaseClient,
  transactionId: string,
  opts?: { expectedUserId?: string },
): Promise<IssueRefundResult> {
  let query = supabase
    .from("transaction")
    .select("id, status, paystack_reference")
    .eq("id", transactionId);

  if (opts?.expectedUserId) {
    query = query.eq("user_id", opts.expectedUserId);
  }

  const { data: transaction, error: transactionError } =
    await query.maybeSingle<{
      id: string;
      status: string;
      paystack_reference: string | null;
    }>();

  if (transactionError || !transaction) {
    logger.error(
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
    return { status: 400, message: "Only successful payments can be refunded" };
  }

  if (!transaction.paystack_reference) {
    return { status: 400, message: "No payment reference on this transaction" };
  }

  // Ticket-revenue-only amount to send back — the service fee stays with
  // Abonten.
  const { data: refundableAmount, error: refundableError } = await supabase.rpc(
    "get_transaction_refundable_amount",
    { p_transaction_id: transaction.id },
  );

  if (refundableError) {
    logger.error(
      `Failed computing refundable amount for transaction ${transaction.id}: ${refundableError.message}`,
    );
  }

  const refundable = Number(refundableAmount ?? 0);
  let refundAmountPesewas: number | undefined;

  if (Number.isFinite(refundable) && refundable > 0) {
    refundAmountPesewas = toPesewas(refundable);
  } else {
    // refundable resolved to 0. Distinguish a genuine accounting gap (a
    // real ticket-backed purchase whose earning rows are missing) from an
    // orphan transaction with no tickets at all (early test data). Only the
    // former should fall back to a full refund; refunding an orphan would
    // move money for a purchase that has no tickets to cancel.
    const { count: ticketCount } = await supabase
      .from("ticket")
      .select("id", { count: "exact", head: true })
      .eq("transaction_id", transaction.id);

    if (!ticketCount || ticketCount === 0) {
      logger.error(
        `Refund requested for transaction ${transaction.id} with no linked tickets — refusing`,
      );
      return {
        status: 400,
        message: "No tickets are linked to this payment",
      };
    }

    logger.error(
      `Refundable amount for transaction ${transaction.id} resolved to ${refundableAmount} despite ${ticketCount} linked ticket(s); falling back to full refund`,
    );
  }

  try {
    await refundTransaction(
      transaction.paystack_reference,
      refundAmountPesewas,
    );
  } catch (error) {
    logger.error(`Refund failed for transaction ${transaction.id}: ${error}`);

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
  // complete — it's asynchronous. The webhook's refund.processed/refund.failed
  // events (src/app/api/paystack/webhook/route.ts) confirm completion and
  // move this to `refunded`.
  //
  // record_refund_hold does the status transition AND the organizer ledger
  // deduction atomically in one Postgres function — the money is reserved
  // the instant Paystack accepts the request, not once it's confirmed.
  const { error: holdError } = await supabase.rpc("record_refund_hold", {
    p_transaction_id: transaction.id,
  });

  if (holdError) {
    logger.error(
      `Failed recording refund hold for transaction ${transaction.id}: ${holdError.message}`,
    );
    return {
      status: 500,
      message:
        "Refund was requested but couldn't be recorded. Please contact support.",
    };
  }

  // Audit-only row: records that the ticket revenue was returned and the
  // Abonten service fee was retained. Best-effort — the money movement and
  // the organizer-ledger hold already happened.
  const { error: feeAdjustmentError } = await supabase.rpc(
    "record_fee_refund_adjustment",
    { p_transaction_id: transaction.id },
  );

  if (feeAdjustmentError) {
    logger.error(
      `Failed recording fee refund adjustment for transaction ${transaction.id}: ${feeAdjustmentError.message}`,
    );
  }

  return {
    status: 200,
    message: "Refund requested — Paystack will confirm once it's processed",
  };
}
