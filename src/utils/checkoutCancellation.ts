// Shared cancel-a-pending-checkout logic for the single-item checkout types
// (event/place promotion) — same category as ticketInventory.ts/
// paymentAttempt.ts: not a "use server" Server Action, accepts an
// already-resolved userId, so it must only ever be reached through actions
// that already resolved userId from the caller's own session.
//
// Deliberately one shared implementation rather than a copy per product
// type: event_promotion_checkout and place_promotion_checkout have the
// identical shape (owner_id, status, no reserved-inventory concept unlike
// ticket_checkout), so the only thing that varies is which table/FK column
// to use.

import type { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import { hasOpenPaymentAttempt } from "@/utils/paymentAttempt";

type PromotionCheckoutTable =
  | "event_promotion_checkout"
  | "place_promotion_checkout";
type PromotionPaymentAttemptColumn =
  | "event_promotion_checkout_id"
  | "place_promotion_checkout_id";

type CancelPromotionCheckoutResult =
  | { status: 200; message: string }
  | { status: 404 | 409 | 500; message: string };

export async function cancelPromotionCheckout(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: PromotionCheckoutTable,
  paymentAttemptColumn: PromotionPaymentAttemptColumn,
  checkoutId: string,
  userId: string,
): Promise<CancelPromotionCheckoutResult> {
  const { data: checkout, error: checkoutError } = await supabase
    .from(table)
    .select("id, status")
    .eq("id", checkoutId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (checkoutError) {
    logger.error(`Failed fetching ${table}: ${checkoutError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!checkout) {
    return { status: 404, message: "Checkout not found" };
  }

  if (checkout.status !== "pending") {
    // Already paid/expired/cancelled — nothing to do, and flipping a paid
    // row's status here would corrupt a real purchase.
    return { status: 200, message: "Checkout cancelled successfully!" };
  }

  // Phase 12 race guard: never cancel out from under an in-flight payment —
  // Paystack could confirm the charge moments later against a checkout
  // that's already been marked cancelled.
  if (await hasOpenPaymentAttempt(supabase, paymentAttemptColumn, checkoutId)) {
    return {
      status: 409,
      message:
        "Payment is currently being processed for this order. Please wait a moment and try again.",
    };
  }

  const { error: updateError } = await supabase
    .from(table)
    .update({ status: "cancelled" })
    .eq("id", checkoutId)
    .eq("owner_id", userId)
    .eq("status", "pending");

  if (updateError) {
    logger.error(`Failed cancelling ${table}: ${updateError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, message: "Checkout cancelled successfully!" };
}
