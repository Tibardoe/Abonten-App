"use server";

import { createClient } from "@/config/supabase/server";
import { cancelTicketCheckoutSessionCore } from "@abonten/services/checkout/cancelTicketCheckoutSessionCore";

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

  return cancelTicketCheckoutSessionCore(
    supabase,
    userData.user.id,
    checkoutSessionId,
  );
}
