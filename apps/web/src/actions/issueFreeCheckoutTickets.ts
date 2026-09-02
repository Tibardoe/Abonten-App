"use server";

import { createClient } from "@/config/supabase/server";
import generateTicket from "@/utils/generateTicket";
import { logger } from "@abonten/core/logger";

/**
 * Client-facing entry point for issuing tickets on a **free** pending
 * checkout session from the basket (PendingCheckoutsBasket "Proceed" on
 * zero-price selections). Paid sessions never reach ticket issuance from the
 * client — they go validateCheckout -> createPaymentAttempt ->
 * verifyPaystackPayment -> finalizePaystackPayment, all server-side.
 *
 * This wrapper exists so `generateTicket` (which trusts its
 * checkout-session-driven pricing and can issue paid tickets when driven by
 * the payment pipeline) is not itself imported into a client component. It
 * re-verifies, as the caller's own session, that every row of the session is
 * pending, owned by the caller, and priced at exactly 0 before delegating.
 */
export default async function issueFreeCheckoutTickets(
  checkoutSessionId: string,
): Promise<{ status: number; message?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: rows, error: rowsError } = await supabase
    .from("ticket_checkout")
    .select("total_price, status")
    .eq("checkout_session_id", checkoutSessionId)
    .eq("user_id", user.id);

  if (rowsError) {
    logger.error(`Failed loading free checkout session: ${rowsError.message}`);
    return { status: 500, message: "Something went wrong" };
  }

  if (!rows || rows.length === 0) {
    return { status: 404, message: "Checkout not found" };
  }

  const allFreeAndPending = rows.every(
    (r) => r.status === "pending" && Number(r.total_price) === 0,
  );

  if (!allFreeAndPending) {
    return {
      status: 409,
      message: "This checkout requires payment. Please use the payment flow.",
    };
  }

  return generateTicket(checkoutSessionId);
}
