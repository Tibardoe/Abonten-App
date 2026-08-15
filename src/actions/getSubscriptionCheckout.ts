"use server";

import { createClient } from "@/config/supabase/server";

export default async function getSubscriptionCheckout(
  checkoutSessionId: string,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: checkoutData, error: checkoutDataError } = await supabase
    .from("subscription_checkout")
    .select("*, subscription_plan(*)")
    .eq("id", checkoutSessionId)
    .eq("user_id", user.id);

  if (checkoutDataError) {
    console.log(`Failed fetching checkout data: ${checkoutDataError.message}`);

    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: checkoutData };
}
