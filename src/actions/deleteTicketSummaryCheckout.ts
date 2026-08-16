"use server";

import { createClient } from "@/config/supabase/server";
import { releasePromoUsage } from "@/utils/promoUsage";
import { releaseTicketQuantity } from "@/utils/ticketInventory";

/**
 * Removes one ticket-type line item from a pending checkout (the trash-can
 * icon in OrderSummary). This used to hard-delete the ticket_checkout row
 * directly, which silently leaked the row's reserved ticket_type.quantity
 * and any promo_code_usage it had claimed — expire_stale_ticket_checkouts
 * can only restock rows it still finds, so a deleted row's reservation was
 * gone for good. Releasing here, and cancelling instead of deleting, keeps
 * this consistent with every other place a checkout/ticket is given up.
 */
export default async function deleteTicketSummaryCheckout(checkoutId: string) {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: checkout, error: checkoutError } = await supabase
    .from("ticket_checkout")
    .select(
      "id, event_id, ticket_type_id, quantity, promo_code, discounted_units, status",
    )
    .eq("id", checkoutId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (checkoutError) {
    console.log(`Failed fetching ticket checkout: ${checkoutError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  if (!checkout) {
    return { status: 404, message: "Checkout not found" };
  }

  if (checkout.status !== "pending") {
    // Already paid/expired/cancelled — nothing reserved to release, and
    // flipping a paid row's status here would corrupt a real purchase.
    return { status: 200, message: "Checkout deleted successfully!" };
  }

  const { error: updateError } = await supabase
    .from("ticket_checkout")
    .update({ status: "cancelled" })
    .eq("id", checkoutId)
    .eq("user_id", userData.user.id)
    .eq("status", "pending");

  if (updateError) {
    console.log(`Failed cancelling ticket checkout: ${updateError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  await releaseTicketQuantity(checkout.ticket_type_id, checkout.quantity);

  if (checkout.promo_code && checkout.discounted_units > 0) {
    const { data: promoCode } = await supabase
      .from("promo_code")
      .select("id")
      .eq("promo_code", checkout.promo_code)
      .maybeSingle();

    if (promoCode) {
      await releasePromoUsage(
        promoCode.id,
        userData.user.id,
        checkout.event_id,
        checkout.discounted_units,
      );
    }
  }

  return { status: 200, message: "Checkout deleted successfully!" };
}
