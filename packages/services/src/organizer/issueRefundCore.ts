import type { Database } from "@abonten/types/database.types";
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
import { fromPesewas, toPesewas } from "@abonten/core/paystackAmount";
import { splitRefundTender } from "@abonten/core/rewards/refundTenderSplit";
import { createNotificationCore } from "@abonten/services/notifications/createNotification";
import { refundTransaction } from "@abonten/services/payments/gateway/paystackService";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

export type IssueRefundResult = {
  status: 200 | 400 | 404 | 500;
  message: string;
};

type RefundTransactionRow = {
  id: string;
  status: string;
  paystack_reference: string | null;
  user_id: string;
  amount: number;
  credit_amount: number;
  credit_refunded_amount: number;
};

/**
 * Gives back the Abonten Credit share of a refund (orders paid partly or
 * wholly with credit). Idempotent in the database, so it's safe to call on
 * every retry: it's what finishes a refund whose credit step failed after
 * the transaction had already moved to refund_pending.
 */
async function returnCreditShare(
  transaction: RefundTransactionRow,
  creditBackMinor: number,
): Promise<{ ok: boolean; returnedNow: boolean }> {
  if (creditBackMinor <= 0) return { ok: true, returnedNow: false };
  const { data, error } = await getSupabaseServiceClient().rpc(
    "credit_refund_redemption",
    { p_transaction_id: transaction.id, p_amount_minor: creditBackMinor },
  );
  if (error) {
    logger.error(
      `Failed returning ${creditBackMinor} pesewas of credit for transaction ${transaction.id}: ${error.message}`,
    );
    return { ok: false, returnedNow: false };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, returnedNow: Boolean(row?.created) };
}

/**
 * How the refundable ticket revenue splits between credit and cash, pro rata
 * to how the order was paid. `refundableMinor` of 0 with linked tickets is
 * an accounting gap: then everything paid is returned.
 */
function tenderSplit(
  transaction: RefundTransactionRow,
  refundableMinor: number,
) {
  const cashMinor = toPesewas(Number(transaction.amount ?? 0));
  const creditMinor = toPesewas(Number(transaction.credit_amount ?? 0));
  return splitRefundTender({
    refundMinor:
      refundableMinor > 0 ? refundableMinor : cashMinor + creditMinor,
    cashMinor,
    creditMinor,
  });
}

/**
 * Requests a partial Paystack refund of the ticket revenue only (the
 * customer-paid Abonten service fee is retained) and records the organizer-
 * ledger hold + fee audit row. An order paid with Abonten Credit gets the
 * credit share back as credit and only the cash share through Paystack; one
 * paid entirely with credit never touches Paystack and is refunded at once.
 * Idempotent: re-checks transaction.status before doing anything, so a
 * retry never double-refunds.
 */
export async function issueRefundCore(
  supabase: SupabaseClient<Database>,
  transactionId: string,
  opts?: { expectedUserId?: string },
): Promise<IssueRefundResult> {
  let query = supabase
    .from("transaction")
    .select(
      "id, status, paystack_reference, user_id, amount, credit_amount, credit_refunded_amount",
    )
    .eq("id", transactionId);

  if (opts?.expectedUserId) {
    query = query.eq("user_id", opts.expectedUserId);
  }

  const { data: transaction, error: transactionError } =
    await query.maybeSingle<RefundTransactionRow>();

  if (transactionError || !transaction) {
    logger.error(
      `Failed fetching transaction for refund: ${transactionError?.message}`,
    );
    return { status: 404, message: "Transaction not found" };
  }

  const hasCredit = Number(transaction.credit_amount ?? 0) > 0;

  if (
    transaction.status === "refunded" ||
    transaction.status === "refund_pending"
  ) {
    // A retry after the credit step failed: finish it (idempotent).
    if (hasCredit && Number(transaction.credit_refunded_amount ?? 0) === 0) {
      const { data: refundableAgain } = await supabase.rpc(
        "get_transaction_refundable_amount",
        { p_transaction_id: transaction.id },
      );
      const again = tenderSplit(
        transaction,
        toPesewas(Number(refundableAgain ?? 0)),
      );
      if (!(await returnCreditShare(transaction, again.creditBackMinor)).ok) {
        return {
          status: 500,
          message:
            "Your refund is in progress, but we couldn't return your credit yet. Please try again or contact support.",
        };
      }
    }
    return transaction.status === "refunded"
      ? { status: 200, message: "This payment was already refunded" }
      : {
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
  let refundableMinor = 0;

  if (Number.isFinite(refundable) && refundable > 0) {
    refundableMinor = toPesewas(refundable);
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

  const split = tenderSplit(transaction, refundableMinor);

  // Cash goes back through Paystack -- only the cash share of an order paid
  // partly with credit, and nothing at all for one paid entirely with
  // credit. A cash-only order with no computable refundable amount keeps the
  // old full-refund fallback (amount omitted).
  if (split.cashBackMinor > 0) {
    try {
      await refundTransaction(
        transaction.paystack_reference,
        hasCredit || refundableMinor > 0 ? split.cashBackMinor : undefined,
      );
    } catch (error) {
      logger.error(`Refund failed for transaction ${transaction.id}: ${error}`);

      // Still record that a request was actually made — refund_requested_at
      // is what lets the UI tell "attempted and failed" apart from "not
      // requested yet" for a transaction stuck at status=successful. Service
      // role: clients can't write `transaction`.
      await getSupabaseServiceClient()
        .from("transaction")
        .update({
          refund_requested_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", transaction.id)
        .is("refund_requested_at", null);

      return {
        status: 500,
        message: "Refund could not be processed. Please contact support.",
      };
    }
  }

  // Paystack accepting the refund request doesn't mean the refund is
  // complete — it's asynchronous. The webhook's refund.processed/refund.failed
  // events (src/app/api/paystack/webhook/route.ts) confirm completion and
  // move this to `refunded`.
  //
  // record_refund_hold does the status transition AND the organizer ledger
  // deduction atomically in one Postgres function — the money is reserved
  // the instant Paystack accepts the request, not once it's confirmed.
  //
  // Run on the service-role client, never the caller's: this and
  // record_fee_refund_adjustment below mutate ledger / transaction state
  // that is not the caller's own row, and are EXECUTE-revoked from
  // `authenticated` (migration 20260903200000). Authorisation is already
  // proven upstream — issueRefund.ts checks admin/organizer, cancelEvent
  // passes only its own event's refundable transactions.
  const privileged = getSupabaseServiceClient();
  const { error: holdError } = await privileged.rpc("record_refund_hold", {
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

  // The credit share comes back straight away. A failure here is retried by
  // calling this again (see the refund_pending branch above). On a retry
  // after Paystack failed the cash part, the credit is already back: the
  // call is a no-op and record_refund_hold above only re-held the cash share.
  const credit = await returnCreditShare(transaction, split.creditBackMinor);
  const creditReturned = credit.ok;

  // Nothing went to Paystack, so no refund.processed webhook will arrive:
  // the refund is complete now.
  if (split.cashBackMinor === 0 && creditReturned) {
    await privileged
      .from("transaction")
      .update({ status: "refunded", updated_at: new Date().toISOString() })
      .eq("id", transaction.id)
      .eq("status", "refund_pending");
  }

  // Audit-only row: records that the ticket revenue was returned and the
  // Abonten service fee was retained. Best-effort — the money movement and
  // the organizer-ledger hold already happened.
  const { error: feeAdjustmentError } = await privileged.rpc(
    "record_fee_refund_adjustment",
    { p_transaction_id: transaction.id },
  );

  if (feeAdjustmentError) {
    logger.error(
      `Failed recording fee refund adjustment for transaction ${transaction.id}: ${feeAdjustmentError.message}`,
    );
  }

  // Best-effort — the hold above is already the source of truth; a failed
  // notification never undoes a real refund request. Completion/failure is
  // notified separately by the webhook once Paystack actually confirms it.
  const creditText = credit.returnedNow
    ? `GH₵ ${fromPesewas(split.creditBackMinor).toFixed(2)} is back in your Abonten Credit`
    : null;
  const completed = split.cashBackMinor === 0;
  await createNotificationCore(privileged, {
    userId: transaction.user_id,
    type: completed ? "refund_completed" : "refund_requested",
    title: completed ? "Refund completed" : "Refund requested",
    body: completed
      ? `${creditText ?? "Your refund is complete"}.`
      : creditText
        ? `${creditText}. We've requested the rest back to your payment method — you'll be notified once it's completed.`
        : "We've requested a refund for your cancelled ticket. You'll be notified once it's completed.",
    link: "/transactions",
    data: { kind: "ticket" },
  }).catch((error) => {
    logger.error(
      `Failed sending refund-requested notification for transaction ${transaction.id}: ${error}`,
    );
  });

  if (!creditReturned) {
    return {
      status: 500,
      message:
        "Your refund was started, but we couldn't return your credit yet. Please try again or contact support.",
    };
  }

  return {
    status: 200,
    message: completed
      ? "Refunded to your Abonten Credit"
      : "Refund requested — Paystack will confirm once it's processed",
  };
}
