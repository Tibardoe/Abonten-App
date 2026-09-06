import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { paymentFulfillmentDeps } from "@/utils/paymentFulfillmentDeps";
import { logger } from "@abonten/core/logger";
import { createNotificationCore } from "@abonten/services/notifications/createNotification";
import { finalizePaystackPayment } from "@abonten/services/payments/finalizePaystackPayment";
import type {
  PaystackRefundWebhookData,
  PaystackWebhookEvent,
} from "@abonten/types/paystackType";
import { NextResponse } from "next/server";

// Checked in the order community-documented Paystack integrations use this
// field across API versions — see PaystackRefundWebhookData's comment.
function extractRefundReference(
  data: PaystackRefundWebhookData,
): string | null {
  return (
    data.transaction_reference ??
    data.transaction?.reference ??
    data.reference ??
    null
  );
}

/**
 * Authoritative Paystack payment confirmation path — the frontend's
 * verifyPaystackPayment action is only an optimistic fast path; this
 * webhook is what finalizes a payment even if the browser is closed,
 * loses network, or the popup callback never fires. Every event is
 * signature-verified before any processing, and finalization goes through
 * the same finalizePaystackPayment() the frontend path uses, so duplicate
 * deliveries (Paystack retries on anything but a 2xx) never double-issue
 * tickets, double-charge inventory, or double-send emails — see
 * src/utils/finalizePaystackPayment.ts's compare-and-swap lock.
 */
export async function POST(req: Request) {
  try {
    const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error("PAYSTACK_WEBHOOK_SECRET is not configured");
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 },
      );
    }

    // Signature is computed over the RAW request body — parsing to JSON
    // first and re-serializing can change byte-for-byte formatting and
    // break verification, so the raw text is read before anything else.
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const expectedSignature = createHmac("sha512", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const signatureBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    const isValidSignature =
      signatureBuffer.length === expectedBuffer.length &&
      timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValidSignature) {
      logger.warn("Rejected Paystack webhook: invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody) as PaystackWebhookEvent;

    if (event.event === "refund.processed" || event.event === "refund.failed") {
      const refundData = event.data as unknown as PaystackRefundWebhookData;
      const reference = extractRefundReference(refundData);

      if (!reference) {
        logger.warn(
          `Paystack webhook: ${event.event} had no resolvable transaction reference`,
          refundData,
        );
        return NextResponse.json({ received: true }, { status: 200 });
      }

      const supabase = getSupabaseServiceClient();
      // A failed refund leaves the underlying payment exactly as it was —
      // still `successful` — not a new "failed" state; the customer's
      // ticket stays cancelled regardless (cancelUserTicket.ts never
      // reverses that), so this is logged for manual follow-up rather than
      // resurrecting the ticket automatically.
      const newStatus =
        event.event === "refund.processed" ? "refunded" : "successful";

      // Only transitions a transaction that's actually awaiting this
      // confirmation — a retried webhook delivery, or one that arrives after
      // this was already resolved another way, is a no-op rather than
      // clobbering a later state.
      const { data: updated, error: updateError } = await supabase
        .from("transaction")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("paystack_reference", reference)
        .eq("status", "refund_pending")
        .select("id, user_id")
        .maybeSingle();

      if (updateError) {
        logger.error(
          `Paystack webhook: failed updating transaction for ${event.event} (${updateError.message})`,
        );
      } else if (!updated) {
        logger.info(
          `Paystack webhook: ${event.event} for reference ${reference} — no matching refund_pending transaction`,
        );
      } else {
        logger.info(
          `Paystack webhook: transaction ${updated.id} -> ${newStatus} via ${event.event}`,
        );

        // No ledger action needed for "refunded" — the deduction already
        // happened when issueRefund.ts recorded a refund_hold at
        // refund_pending request time (see the migration that added
        // record_refund_hold/record_refund_release). A failed refund
        // reverts the transaction to `successful`, meaning the money never
        // actually left the organizer, so the earlier hold must be
        // reversed — record_refund_release mirrors off the transaction's
        // own refund_hold rows, and this call site is already guarded by
        // the `.eq("status","refund_pending")` update above, so a retried
        // webhook delivery for the same failure never runs this twice.
        if (newStatus === "successful") {
          const { error: releaseError } = await supabase.rpc(
            "record_refund_release",
            { p_transaction_id: updated.id },
          );

          if (releaseError) {
            logger.error(
              `Paystack webhook: failed recording refund release for transaction ${updated.id}: ${releaseError.message}`,
            );
          }
        }

        // Best-effort — the transaction/ledger state above is already
        // final regardless of whether this notification succeeds.
        await createNotificationCore(supabase, {
          userId: updated.user_id,
          type: newStatus === "refunded" ? "refund_completed" : "refund_failed",
          title:
            newStatus === "refunded"
              ? "Refund completed"
              : "Refund couldn't be completed",
          body:
            newStatus === "refunded"
              ? "Your refund has been processed by Paystack."
              : "We couldn't process your refund automatically. Our team will follow up.",
          link: "/transactions",
          data: { kind: "ticket" },
        }).catch((error) => {
          logger.error(
            `Paystack webhook: failed sending refund notification for transaction ${updated.id}: ${error}`,
          );
        });
      }

      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Automated organizer payouts (Paystack Transfers API). Only acts on a
    // payout that actually has an automated transfer attached
    // (transfer_status = 'pending'); a manually-settled payout has no
    // transfer_code and is untouched here.
    if (
      event.event === "transfer.success" ||
      event.event === "transfer.failed" ||
      event.event === "transfer.reversed"
    ) {
      const transfer = event.data as unknown as {
        transfer_code?: string;
        reason?: string | null;
      };
      const transferCode = transfer.transfer_code ?? null;
      if (!transferCode) {
        return NextResponse.json({ received: true }, { status: 200 });
      }

      const supabase = getSupabaseServiceClient();
      const succeeded = event.event === "transfer.success";
      const nextTransferStatus = succeeded
        ? "success"
        : event.event === "transfer.reversed"
          ? "reversed"
          : "failed";

      const { data: payout, error: payoutErr } = await supabase
        .from("payout")
        .update({
          transfer_status: nextTransferStatus,
          transfer_failure_reason: succeeded
            ? null
            : (transfer.reason ?? event.event),
          updated_at: new Date().toISOString(),
        })
        .eq("transfer_code", transferCode)
        .eq("transfer_status", "pending")
        .select("id")
        .maybeSingle();

      if (payoutErr) {
        logger.error(
          `Paystack webhook: failed updating payout for ${event.event} (${payoutErr.message})`,
        );
      } else if (!payout) {
        logger.info(
          `Paystack webhook: ${event.event} for transfer ${transferCode} — no pending payout matched (already settled or manual)`,
        );
      } else {
        const { error: settleErr } = await supabase.rpc("admin_settle_payout", {
          p_payout_id: payout.id,
          p_status: succeeded ? "completed" : "failed",
          p_failure_reason: succeeded
            ? undefined
            : (transfer.reason ?? event.event),
        });
        if (settleErr) {
          logger.error(
            `Paystack webhook: admin_settle_payout failed for payout ${payout.id}: ${settleErr.message}`,
          );
        } else {
          logger.info(
            `Paystack webhook: payout ${payout.id} settled via ${event.event}`,
          );
        }
      }

      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (event.event !== "charge.success") {
      // Acknowledge and ignore other event types so Paystack doesn't keep
      // retrying delivery of events this app doesn't act on.
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const reference = event.data.reference;
    const supabase = getSupabaseServiceClient();

    const { data: attempt, error: attemptError } = await supabase
      .from("payment_attempt")
      .select("id")
      .eq("provider_reference", reference)
      .maybeSingle();

    if (attemptError) {
      logger.error(
        `Paystack webhook: failed looking up payment_attempt: ${attemptError.message}`,
      );
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (!attempt) {
      logger.warn(
        `Paystack webhook: no payment_attempt found for reference (event id ${event.data.id})`,
      );
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const result = await finalizePaystackPayment(
      supabase,
      attempt.id,
      paymentFulfillmentDeps,
    );

    logger.info(
      `Paystack webhook: finalized attempt ${attempt.id} -> ${result.status}`,
    );

    // Always ack with 200 once the signature is valid and we've attempted
    // finalization — finalizePaystackPayment's own CAS lock is what makes
    // Paystack's retry-on-non-2xx behavior safe to rely on for anything
    // that failed transiently, without needing this handler to reflect
    // internal finalization failures as HTTP errors.
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    logger.error("Paystack webhook error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
