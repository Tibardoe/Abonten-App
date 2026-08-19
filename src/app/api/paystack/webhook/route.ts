import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import type {
  PaystackRefundWebhookData,
  PaystackWebhookEvent,
} from "@/types/paystackType";
import { finalizePaystackPayment } from "@/utils/finalizePaystackPayment";
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
      console.error("PAYSTACK_WEBHOOK_SECRET is not configured");
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
      console.warn("Rejected Paystack webhook: invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody) as PaystackWebhookEvent;

    if (event.event === "refund.processed" || event.event === "refund.failed") {
      const refundData = event.data as unknown as PaystackRefundWebhookData;
      const reference = extractRefundReference(refundData);

      if (!reference) {
        console.warn(
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
        .update({ status: newStatus, updated_at: new Date() })
        .eq("paystack_reference", reference)
        .eq("status", "refund_pending")
        .select("id")
        .maybeSingle();

      if (updateError) {
        console.error(
          `Paystack webhook: failed updating transaction for ${event.event} (${updateError.message})`,
        );
      } else if (!updated) {
        console.log(
          `Paystack webhook: ${event.event} for reference ${reference} — no matching refund_pending transaction`,
        );
      } else {
        console.log(
          `Paystack webhook: transaction ${updated.id} -> ${newStatus} via ${event.event}`,
        );
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
      console.error(
        `Paystack webhook: failed looking up payment_attempt: ${attemptError.message}`,
      );
      return NextResponse.json({ received: true }, { status: 200 });
    }

    if (!attempt) {
      console.warn(
        `Paystack webhook: no payment_attempt found for reference (event id ${event.data.id})`,
      );
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const result = await finalizePaystackPayment(supabase, attempt.id);

    console.log(
      `Paystack webhook: finalized attempt ${attempt.id} -> ${result.status}`,
    );

    // Always ack with 200 once the signature is valid and we've attempted
    // finalization — finalizePaystackPayment's own CAS lock is what makes
    // Paystack's retry-on-non-2xx behavior safe to rely on for anything
    // that failed transiently, without needing this handler to reflect
    // internal finalization failures as HTTP errors.
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Paystack webhook error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
