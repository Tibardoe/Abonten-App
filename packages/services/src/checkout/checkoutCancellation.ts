import type { Database } from "@abonten/types/database.types";
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

import { logger } from "@abonten/core/logger";
import { hasOpenPaymentAttempt } from "@abonten/services/payments/paymentAttempt";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

type PromotionCheckoutTable =
  | "event_promotion_checkout"
  | "place_promotion_checkout"
  | "content_campaign_checkout";
type PromotionPaymentAttemptColumn =
  | "event_promotion_checkout_id"
  | "place_promotion_checkout_id"
  | "content_campaign_checkout_id";

type CancelPromotionCheckoutResult =
  | { status: 200; message: string }
  | { status: 404 | 409 | 500; message: string };

export async function cancelPromotionCheckout(
  supabase: SupabaseClient<Database>,
  table: PromotionCheckoutTable,
  paymentAttemptColumn: PromotionPaymentAttemptColumn,
  checkoutId: string,
  userId: string,
): Promise<CancelPromotionCheckoutResult> {
  // Promotion checkouts are server-write-only since the 2026-09-10 money-path
  // lockdown (no client UPDATE policy or grant), so the caller's own client
  // can read but not cancel. The caller has already proved who `userId` is;
  // every query below is scoped to that owner, and the write uses the
  // service role.
  void supabase;
  const svc = getSupabaseServiceClient();
  const { data: checkout, error: checkoutError } = await svc
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
  if (await hasOpenPaymentAttempt(svc, paymentAttemptColumn, checkoutId)) {
    return {
      status: 409,
      message:
        "Payment is currently being processed for this order. Please wait a moment and try again.",
    };
  }

  const { error: updateError } = await svc
    .from(table)
    .update({ status: "cancelled" })
    .eq("id", checkoutId)
    .eq("owner_id", userId)
    .eq("status", "pending");

  if (updateError) {
    logger.error(`Failed cancelling ${table}: ${updateError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  // A Spotlight campaign waiting on this checkout goes back to draft, the
  // same as when the checkout expires, so the post can be promoted again.
  if (table === "content_campaign_checkout") {
    const { data: row } = await svc
      .from("content_campaign_checkout")
      .select("campaign_id")
      .eq("id", checkoutId)
      .maybeSingle();
    if (row?.campaign_id) {
      await svc.rpc("content_campaign_transition", {
        p_campaign_id: row.campaign_id,
        p_to: "cancelled",
        p_actor_id: userId,
        p_actor_kind: "advertiser",
        p_reason: "Checkout cancelled before payment",
      });
    }
  }

  return { status: 200, message: "Checkout cancelled successfully!" };
}
