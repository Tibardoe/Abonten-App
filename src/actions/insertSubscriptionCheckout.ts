"use server";

import { createClient } from "@/config/supabase/server";

export default async function insertSubscriptionCheckout(
  SubscriptionName: string | null,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500,
      message: `Error fetching user: ${userError.message} `,
    };
  }

  if (!user) {
    return { status: 401, message: "User not authenticated" };
  }

  const { data: subscriptionPackage, error: subscriptionPackageError } =
    await supabase
      .from("subscription_plan")
      .select("*")
      .eq("name", SubscriptionName)
      .single();

  if (subscriptionPackageError || !subscriptionPackage) {
    console.log(
      `Error fetching subscription package: ${subscriptionPackageError?.message}`,
    );

    return { status: 500, message: "Something went wrong!" };
  }

  const {
    data: subscriptionCheckoutData,
    error: insertSubscriptionCheckoutError,
  } = await supabase
    .from("subscription_checkout")
    .insert({
      user_id: user.id,
      subscription_plan_name: subscriptionPackage.name,
      unit_price: subscriptionPackage.price,
      total_price: subscriptionPackage.price,
    })
    .select("id")
    .single();

  if (insertSubscriptionCheckoutError) {
    console.log(
      `Error inserting subscription checkout:${insertSubscriptionCheckoutError.message}`,
    );

    return { status: 500, message: "Something went wrong!" };
  }

  if (!subscriptionCheckoutData) {
    return { status: 404, message: "No subscription checkout data found!" };
  }

  return { status: 200, data: subscriptionCheckoutData };
}
