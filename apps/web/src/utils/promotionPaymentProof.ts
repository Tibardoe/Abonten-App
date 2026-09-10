import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { logger } from "@abonten/core/logger";

/**
 * Whether a promotion checkout has a payment that finalizePaystackPayment
 * has verified: an attempt for this checkout, owned by this user, that
 * carries a recorded `successful` transaction and is being (or has been)
 * fulfilled. The promotion activation steps refuse to run without one --
 * the same guard issue_tickets_for_checkout applies to paid ticket orders.
 */
export async function hasVerifiedPromotionPayment(
  column: "event_promotion_checkout_id" | "place_promotion_checkout_id",
  checkoutId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await getSupabaseServiceClient()
    .from("payment_attempt")
    .select("id, transaction:transaction_id(status)")
    .eq(column, checkoutId)
    .eq("user_id", userId)
    .in("status", ["processing", "succeeded"])
    .not("transaction_id", "is", null);

  if (error) {
    logger.error(`hasVerifiedPromotionPayment failed: ${error.message}`);
    return false;
  }

  return (data ?? []).some(
    (row) =>
      (row.transaction as unknown as { status: string } | null)?.status ===
      "successful",
  );
}
