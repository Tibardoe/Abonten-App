"use server";

import { createClient } from "@/config/supabase/server";
import type { AuthOverride } from "@/types/authOverrideType";

/**
 * Commit step for a subscription purchase — the equivalent of generateTicket
 * for tickets. This is the function a payment webhook/verify step calls
 * once it has independently confirmed payment for the given checkout
 * session (see src/utils/finalizePaystackPayment.ts). It never trusts a
 * client-supplied plan or price — everything comes from the already-priced
 * subscription_checkout row and the subscription_plan it references.
 *
 * `authOverride` lets the Paystack webhook (no cookies/session) call this
 * without a browser session — see src/types/authOverrideType.ts. The
 * existing frontend-verify call path omits it and keeps deriving the user
 * from cookies exactly as before.
 */
export default async function activateSubscription(
  checkoutSessionId: string,
  authOverride?: AuthOverride,
) {
  const supabase = authOverride?.supabase ?? (await createClient());

  let userId: string;

  if (authOverride) {
    userId = authOverride.userId;
  } else {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { status: 401, message: "User not logged in" };
    }

    userId = user.id;
  }

  // Distinguish "never existed / wrong user" (404) from "existed but timed
  // out" (410) by checking existence BEFORE running the expiry sweep below —
  // mirrors generateTicket.ts's initial-then-post-sweep read for tickets.
  const { data: existingCheckout, error: existingCheckoutError } =
    await supabase
      .from("subscription_checkout")
      .select("id")
      .eq("id", checkoutSessionId)
      .eq("user_id", userId)
      .maybeSingle();

  if (existingCheckoutError) {
    console.log(
      `Failed fetching subscription checkout: ${existingCheckoutError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if (!existingCheckout) {
    return { status: 404, message: "Checkout not found" };
  }

  // Reclaim this checkout if its reservation window has passed — the same
  // atomic sweep the scheduled cron job runs. Re-querying by
  // status = 'pending' afterward keeps this in lockstep with whatever the
  // sweep actually decided (including its grace period), instead of
  // re-implementing the expiry check locally.
  await supabase.rpc("expire_stale_subscription_checkouts");

  const { data: checkout, error: checkoutError } = await supabase
    .from("subscription_checkout")
    .select("*, subscription_plan(*)")
    .eq("id", checkoutSessionId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (checkoutError) {
    console.log(
      `Failed fetching subscription checkout: ${checkoutError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if (!checkout) {
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
      user_id: userId,
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
