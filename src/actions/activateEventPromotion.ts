"use server";

import createNotification from "@/actions/createNotification";
import { createClient } from "@/config/supabase/server";
import type { AuthOverride } from "@/types/authOverrideType";

/**
 * Commit step for an Event Promotion purchase — mirrors
 * activatePlacePromotion.ts exactly. Called only by
 * src/utils/finalizePaystackPayment.ts once it has independently verified
 * payment for the given checkout. Never trusts a client-supplied
 * duration/price — everything comes from the already-priced
 * event_promotion_checkout row and the tier it references.
 *
 * `authOverride` lets the Paystack webhook (no cookies/session) call this
 * without a browser session — see src/types/authOverrideType.ts.
 */
export default async function activateEventPromotion(
  checkoutId: string,
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
  // mirrors activatePlacePromotion.ts's initial-then-post-sweep read.
  const { data: existingCheckout, error: existingCheckoutError } =
    await supabase
      .from("event_promotion_checkout")
      .select("id")
      .eq("id", checkoutId)
      .eq("owner_id", userId)
      .maybeSingle();

  if (existingCheckoutError) {
    console.log(
      `Failed fetching event promotion checkout: ${existingCheckoutError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if (!existingCheckout) {
    return { status: 404, message: "Checkout not found" };
  }

  await supabase.rpc("expire_stale_event_promotion_checkouts");

  const { data: checkout, error: checkoutError } = await supabase
    .from("event_promotion_checkout")
    .select("*, event_promotion_tier(*)")
    .eq("id", checkoutId)
    .eq("owner_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (checkoutError) {
    console.log(
      `Failed fetching event promotion checkout: ${checkoutError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if (!checkout) {
    return {
      status: 410,
      message: "This checkout has expired. Please start again.",
    };
  }

  const tier = checkout.event_promotion_tier;

  if (!tier) {
    return { status: 404, message: "Promotion tier not found" };
  }

  const startsAt = new Date();

  // tier.duration is a Postgres interval (e.g. "3 days", "1 mon") — computed
  // in the database via RPC rather than parsed/reimplemented in application
  // code, matching compute_place_promotion_end_date's exact reasoning.
  const { data: computedEndsAt, error: endsAtError } = await supabase.rpc(
    "compute_event_promotion_end_date",
    { p_tier_id: tier.id, p_from_date: startsAt.toISOString() },
  );

  if (endsAtError || !computedEndsAt) {
    console.log(`Failed computing promotion end date: ${endsAtError?.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  const { error: insertError } = await supabase.from("event_promotion").insert({
    event_id: checkout.event_id,
    tier_id: tier.id,
    starts_at: startsAt.toISOString(),
    ends_at: computedEndsAt,
    promotion_checkout_id: checkout.id,
  });

  if (insertError) {
    console.log(`Failed activating event promotion: ${insertError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  await supabase
    .from("event_promotion_checkout")
    .update({ status: "paid", completed_at: new Date() })
    .eq("id", checkout.id);

  const { data: event } = await supabase
    .from("event")
    .select("title")
    .eq("id", checkout.event_id)
    .maybeSingle();

  await createNotification(
    {
      userId,
      type: "promotion_started",
      title: "Your event is now featured",
      body: event?.title
        ? `${event.title} is now featured (${tier.duration_label}).`
        : `Your promotion is now active (${tier.duration_label}).`,
      link: `/manage/events/${checkout.event_id}`,
    },
    supabase,
  );

  return {
    status: 200,
    message: "Event is now featured",
    data: { endsAt: computedEndsAt },
  };
}
