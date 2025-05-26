"use server";

import { createClient } from "@/config/supabase/server";

export default async function getSubscriptionCheckout(
  checkoutSessionId: string,
) {
  const supabase = await createClient();

  const { data: checkoutData, error: checkoutDataError } = await supabase
    .from("subscription_checkout")
    .select("*, subscription_plan(*)")
    .eq("id", checkoutSessionId);

  if (checkoutDataError) {
    console.log(`Failed fetching checkout data: ${checkoutDataError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: checkoutData };
}
