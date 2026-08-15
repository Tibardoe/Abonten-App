"use server";

import { createClient } from "@/config/supabase/server";

/**
 * Commit step for a subscription purchase — the equivalent of generateTicket
 * for tickets. Not called from any UI yet, since there's no payment provider
 * to confirm payment: this is the function a future payment webhook/verify
 * step should call once it has independently confirmed payment for the
 * given checkout session. It never trusts a client-supplied plan or price —
 * everything comes from the already-priced subscription_checkout row and
 * the subscription_plan it references.
 */
export default async function activateSubscription(checkoutSessionId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 401, message: "User not logged in" };
  }

  const { data: checkout, error: checkoutError } = await supabase
    .from("subscription_checkout")
    .select("*, subscription_plan(*)")
    .eq("id", checkoutSessionId)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (checkoutError) {
    console.log(
      `Failed fetching subscription checkout: ${checkoutError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if (!checkout) {
    return { status: 404, message: "Checkout not found" };
  }

  if (checkout.expires_at && new Date(checkout.expires_at) < new Date()) {
    await supabase
      .from("subscription_checkout")
      .update({ status: "expired" })
      .eq("id", checkout.id);

    return {
      status: 410,
      message: "This checkout has expired. Please start again.",
    };
  }

  const plan = checkout.subscription_plan;

  if (!plan) {
    return { status: 404, message: "Subscription plan not found" };
  }

  const startDate = new Date();

  // duration is a Postgres interval — computed in the database via RPC
  // rather than parsed/reimplemented in application code.
  const { data: endDate, error: endDateError } = await supabase.rpc(
    "compute_subscription_end_date",
    { plan_id: plan.id, from_date: startDate.toISOString() },
  );

  if (endDateError || !endDate) {
    console.log(
      `Failed computing subscription end date: ${endDateError?.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  const { error: upsertError } = await supabase.from("subscription").upsert(
    {
      user_id: user.id,
      plan_id: plan.id,
      start_date: startDate,
      end_date: endDate,
      events_used: 0,
      stories_used: 0,
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    console.log(`Failed activating subscription: ${upsertError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  await supabase
    .from("subscription_checkout")
    .update({ status: "paid", completed_at: new Date() })
    .eq("id", checkout.id);

  return { status: 200, message: "Subscription activated successfully" };
}
