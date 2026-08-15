"use server";

import { createClient } from "@/config/supabase/server";
import releasePromoUsage from "./releasePromoUsage";
import releaseTicketQuantity from "./releaseTicketQuantity";

/**
 * Cancels a pending checkout the caller owns, releasing anything it had
 * reserved (ticket inventory, promo redemption) before removing it. Only
 * ever acts on the caller's own, still-pending rows — a checkout already
 * marked "paid" is left untouched.
 */
export default async function deleteCheckout(
  checkoutId: string,
  type: "ticket" | "subscription",
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  if (type === "ticket") {
    const { data: rows, error: fetchError } = await supabase
      .from("ticket_checkout")
      .select(
        "id, event_id, ticket_type_id, quantity, promo_code, discounted_units",
      )
      .eq("checkout_session_id", checkoutId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (fetchError) {
      console.log(`Failed fetching ticket checkout: ${fetchError.message}`);
      return { status: 500, message: "Something went wrong!" };
    }

    if (!rows || rows.length === 0) {
      return { status: 200, message: "Checkout deleted successfully!" };
    }

    for (const row of rows) {
      await releaseTicketQuantity(row.ticket_type_id, row.quantity);
    }

    const totalDiscountedUnits = rows.reduce(
      (sum, row) => sum + (row.discounted_units || 0),
      0,
    );
    const promoCode = rows[0].promo_code;
    const eventId = rows[0].event_id;

    if (promoCode && totalDiscountedUnits > 0) {
      const { data: promo } = await supabase
        .from("promo_code")
        .select("id")
        .eq("promo_code", promoCode)
        .maybeSingle();

      if (promo) {
        await releasePromoUsage(
          promo.id,
          user.id,
          eventId,
          totalDiscountedUnits,
        );
      }
    }

    const { error: deleteTicketCheckoutError } = await supabase
      .from("ticket_checkout")
      .delete()
      .in(
        "id",
        rows.map((row) => row.id),
      );

    if (deleteTicketCheckoutError) {
      console.log(
        `Failed deleting ticket checkout: ${deleteTicketCheckoutError.message}`,
      );

      return { status: 500, message: "Something went wrong!" };
    }
  } else if (type === "subscription") {
    const { error: deleteSubscriptionCheckoutError } = await supabase
      .from("subscription_checkout")
      .delete()
      .eq("id", checkoutId)
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (deleteSubscriptionCheckoutError) {
      console.log(
        `Failed deleting subscription checkout: ${deleteSubscriptionCheckoutError.message}`,
      );
      return { status: 500, message: "Something went wrong!" };
    }
  } else {
    return { status: 400, message: "Invalid checkout type" };
  }

  return { status: 200, message: "Checkout deleted successfully!" };
}
