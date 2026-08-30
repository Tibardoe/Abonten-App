"use server";

import { createClient } from "@/config/supabase/server";
import { logger } from "@/utils/logger";
import { hasOpenPaymentAttempt } from "@/utils/paymentAttempt";
import { releasePromoUsage } from "@/utils/promoUsage";
import { releaseTicketQuantity } from "@/utils/ticketInventory";

type PendingRow = {
  id: string;
  event_id: string;
  ticket_type_id: string;
  quantity: number;
  promo_code: string | null;
  discounted_units: number;
};

/**
 * Removes an entire pending checkout session (the "Remove this checkout"
 * button in the order-summary basket) — every ticket-type line item that
 * shares this checkout_session_id, not just one. Safe to fully release the
 * promo usage row here (unlike the per-line deleteTicketSummaryCheckout,
 * which must check for surviving sibling lines first): the "one pending
 * checkout per event per user" rule enforced in validateCheckout.ts means a
 * pending session is always that user's only claim on that event+promo, so
 * cancelling the whole session really is "fully cancelled."
 */
export default async function cancelTicketCheckoutSession(
  checkoutSessionId: string,
) {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: rawRows, error: fetchError } = await supabase
    .from("ticket_checkout")
    .select(
      "id, event_id, ticket_type_id, quantity, promo_code, discounted_units",
    )
    .eq("checkout_session_id", checkoutSessionId)
    .eq("user_id", userData.user.id)
    .eq("status", "pending");

  if (fetchError) {
    logger.error(`Failed fetching checkout session: ${fetchError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const rows = (rawRows ?? []) as PendingRow[];

  if (rows.length === 0) {
    return { status: 404, message: "Checkout not found" };
  }

  // Phase 12 race guard — see deleteTicketSummaryCheckout.ts.
  if (
    await hasOpenPaymentAttempt(
      supabase,
      "checkout_session_id",
      checkoutSessionId,
    )
  ) {
    return {
      status: 409,
      message:
        "Payment is currently being processed for this order. Please wait a moment and try again.",
    };
  }

  const { error: updateError } = await supabase
    .from("ticket_checkout")
    .update({ status: "cancelled" })
    .eq("checkout_session_id", checkoutSessionId)
    .eq("user_id", userData.user.id)
    .eq("status", "pending");

  if (updateError) {
    logger.error(`Failed cancelling checkout session: ${updateError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  for (const row of rows) {
    await releaseTicketQuantity(row.ticket_type_id, row.quantity);
  }

  const eventId = rows[0].event_id;
  const promoCode = rows[0].promo_code;
  const totalDiscountedUnits = rows.reduce(
    (sum, row) => sum + row.discounted_units,
    0,
  );

  if (promoCode && totalDiscountedUnits > 0) {
    const { data: promoCodeRow } = await supabase
      .from("promo_code")
      .select("id")
      .eq("promo_code", promoCode)
      .maybeSingle();

    if (promoCodeRow) {
      await releasePromoUsage(
        promoCodeRow.id,
        userData.user.id,
        eventId,
        totalDiscountedUnits,
      );
    }
  }

  return { status: 200, message: "Checkout removed successfully!" };
}
