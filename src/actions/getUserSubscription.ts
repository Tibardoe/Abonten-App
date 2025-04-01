"use server";

import { createClient } from "@/config/supabase/server";

export async function userSubscription() {
  const supabase = await createClient();

  const { data: user, error: userError } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "Unauthorized" };
  }

  const { data: subscription, error } = await supabase
    .from("subscription")
    .select("id, subscription_plan:plan_id(name)")
    .eq("user_id", user.user.id)
    .maybeSingle(); // Works because each user has at most one subscription

  if (error) {
    return {
      status: 500,
      message: `Error fetching subscription: ${error.message}`,
    };
  }

  if (!subscription) {
    return { status: 404, message: "No active subscription found" };
  }

  return { status: 200, data: subscription };
}
