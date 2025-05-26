"use server";

import { createClient } from "@/config/supabase/server";

export default async function deleteCheckout(
  checkoutId: string,
  type: "ticket" | "subscription",
) {
  const supabase = await createClient();

  if (type === "ticket") {
    const { error: deleteTicketCheckoutError } = await supabase
      .from("ticket_checkout")
      .delete()
      .eq("checkout_session_id", checkoutId);

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
      .eq("id", checkoutId);

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
