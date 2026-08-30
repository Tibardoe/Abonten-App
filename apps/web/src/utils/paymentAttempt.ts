// Shared "reuse an open attempt for the same method, else cancel the old one
// and insert a fresh row" logic for payment_attempt, extracted out of
// createPaymentAttempt.ts so createMultiCheckoutPaymentAttempt.ts (paying for
// several checkout sessions at once) doesn't duplicate it. Deliberately NOT a
// "use server" Server Action — same category as ticketInventory.ts/
// promoUsage.ts: it accepts an arbitrary userId with no session binding of
// its own, so it must only ever be reached through actions that already
// resolved userId from the caller's own session.

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";

export type PaymentAttemptRow = {
  id: string;
  status:
    | "initiated"
    | "pending"
    | "processing"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "refunded";
  amount: number;
  currency: string;
  payment_method_id: string | null;
  provider_reference: string | null;
  metadata: Record<string, unknown> | null;
};

const PAYMENT_ATTEMPT_ROW_SELECT =
  "id, status, amount, currency, payment_method_id, provider_reference, metadata";

type UpsertPaymentAttemptResult =
  | { status: 500; message: string }
  | { status: 200; data: PaymentAttemptRow };

/**
 * Records that the user has chosen a saved payment method to pay for one
 * still-pending checkout (ticket, place promotion, or event promotion) — it
 * does NOT complete the purchase. Retrying with the same method reuses the
 * still-open attempt
 * instead of spawning duplicates; switching methods cancels the old attempt
 * and opens a new one. When paymentGroupId is given, it tags the row (new or
 * reused) as belonging to that combined pay action, so several sessions paid
 * together stay traceable as one group without merging their rows.
 */
export async function upsertPaymentAttemptForSession(
  userId: string,
  matchColumn:
    | "checkout_session_id"
    | "place_promotion_checkout_id"
    | "event_promotion_checkout_id",
  matchValue: string,
  amount: number,
  currency: string,
  paymentMethodId: string,
  paymentGroupId?: string,
): Promise<UpsertPaymentAttemptResult> {
  const supabase = await createClient();

  const { data: existingAttempt, error: existingError } = await supabase
    .from("payment_attempt")
    .select(PAYMENT_ATTEMPT_ROW_SELECT)
    .eq(matchColumn, matchValue)
    .eq("user_id", userId)
    .in("status", ["initiated", "pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    logger.error(`Failed checking existing attempt: ${existingError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (existingAttempt) {
    if (existingAttempt.payment_method_id === paymentMethodId) {
      if (!paymentGroupId) {
        return { status: 200, data: existingAttempt as PaymentAttemptRow };
      }

      const { data: updated, error: updateError } = await supabase
        .from("payment_attempt")
        .update({ payment_group_id: paymentGroupId, updated_at: new Date() })
        .eq("id", existingAttempt.id)
        .select(PAYMENT_ATTEMPT_ROW_SELECT)
        .single();

      if (updateError) {
        logger.error(
          `Failed grouping existing attempt: ${updateError.message}`,
        );
        return { status: 500, message: "Something went wrong!" };
      }

      return { status: 200, data: updated as PaymentAttemptRow };
    }

    await supabase
      .from("payment_attempt")
      .update({ status: "cancelled", updated_at: new Date() })
      .eq("id", existingAttempt.id);
  }

  const { data: attempt, error: insertError } = await supabase
    .from("payment_attempt")
    .insert({
      user_id: userId,
      [matchColumn]: matchValue,
      payment_method_id: paymentMethodId,
      amount,
      currency,
      status: "initiated",
      payment_group_id: paymentGroupId ?? null,
    })
    .select(PAYMENT_ATTEMPT_ROW_SELECT)
    .single();

  if (insertError) {
    logger.error(`Failed creating payment attempt: ${insertError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: attempt as PaymentAttemptRow };
}

type CheckoutMatchColumn =
  | "checkout_session_id"
  | "place_promotion_checkout_id"
  | "event_promotion_checkout_id";

/**
 * The Phase 12 payment-race guard: is a payment currently in flight for this
 * checkout? Cancelling a checkout while Paystack is mid-confirmation could
 * orphan a successful charge (a paid payment_attempt pointing at a checkout
 * that was cancelled out from under it), so every checkout-cancellation path
 * must check this before flipping a checkout to 'cancelled'.
 */
export async function hasOpenPaymentAttempt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchColumn: CheckoutMatchColumn,
  matchValue: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("payment_attempt")
    .select("id")
    .eq(matchColumn, matchValue)
    .in("status", ["initiated", "pending", "processing"])
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error(`Failed checking open payment attempts: ${error.message}`);
    // Fail closed: if this can't be verified, don't risk cancelling a
    // checkout that might actually be mid-payment.
    return true;
  }

  return !!data;
}

export type LatestPaymentAttemptStatus = {
  id: string;
  status: PaymentAttemptRow["status"] | "fulfillment_failed";
  failureReason: string | null;
};

/**
 * The most recent payment_attempt for a checkout, regardless of state —
 * used purely for display (e.g. showing a "payment succeeded, we're
 * completing your purchase" recovery banner on a checkout page revisit,
 * instead of relying only on the live component's in-memory state).
 */
export async function getLatestPaymentAttemptStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  matchColumn: CheckoutMatchColumn,
  matchValue: string,
): Promise<LatestPaymentAttemptStatus | null> {
  const { data, error } = await supabase
    .from("payment_attempt")
    .select("id, status, failure_reason")
    .eq(matchColumn, matchValue)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      logger.error(`Failed fetching latest payment attempt: ${error.message}`);
    }
    return null;
  }

  return {
    id: data.id,
    status: data.status,
    failureReason: data.failure_reason ?? null,
  };
}
