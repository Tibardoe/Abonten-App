import { logger } from "@abonten/core/logger";
import { releasePromoUsage } from "@abonten/services/checkout/promoUsage";
import { releaseTicketQuantity } from "@abonten/services/checkout/ticketInventory";
import { hasOpenPaymentAttempt } from "@abonten/services/payments/paymentAttempt";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Post-auth body of cancelTicketCheckoutSession — shared with
// `/api/mobile/checkout/cancel`. See cancelTicketCheckoutSession.ts for the
// "safe to fully release promo usage here" reasoning. The status change runs
// on the service-role client (clients can't write ticket_checkout), scoped
// to the caller's own rows.

type PendingRow = {
  id: string;
  event_id: string;
  ticket_type_id: string;
  quantity: number;
  promo_code: string | null;
  discounted_units: number;
};

export type CancelCheckoutResult = {
  status: 200 | 404 | 409 | 500;
  message: string;
};

export async function cancelTicketCheckoutSessionCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  checkoutSessionId: string,
): Promise<CancelCheckoutResult> {
  const { data: rawRows, error: fetchError } = await supabase
    .from("ticket_checkout")
    .select(
      "id, event_id, ticket_type_id, quantity, promo_code, discounted_units",
    )
    .eq("checkout_session_id", checkoutSessionId)
    .eq("user_id", userId)
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

  const { error: updateError } = await getSupabaseServiceClient()
    .from("ticket_checkout")
    .update({ status: "cancelled" })
    .eq("checkout_session_id", checkoutSessionId)
    .eq("user_id", userId)
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
    // Codes are unique per EVENT, not globally
    // (promo_code_event_id_normalized_code_key), so two organizers can both
    // run "EARLYBIRD" — the placeholder this app's own promo field suggests.
    // Without the event scope this lookup matched every event using the same
    // string: maybeSingle() then errored on the multiple rows and returned
    // null, so the buyer's usage was silently never released and they could
    // not re-apply their own code after cancelling.
    const { data: promoCodeRow, error: promoCodeLookupError } = await supabase
      .from("promo_code")
      .select("id")
      .eq("event_id", eventId)
      .eq("promo_code", promoCode)
      .maybeSingle();

    if (promoCodeLookupError) {
      logger.error(
        `Could not resolve promo code "${promoCode}" on event ${eventId} while cancelling a checkout: ${promoCodeLookupError.message}`,
      );
    }

    if (promoCodeRow) {
      await releasePromoUsage(
        promoCodeRow.id,
        userId,
        eventId,
        totalDiscountedUnits,
        supabase,
      );
    }
  }

  return { status: 200, message: "Checkout removed successfully!" };
}
