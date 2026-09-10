import createNotification from "@/actions/createNotification";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { logger } from "@abonten/core/logger";
import type { AuthOverride } from "@abonten/types/authOverrideType";
import { revalidatePath } from "next/cache";
import { hasVerifiedPromotionPayment } from "./promotionPaymentProof";

/**
 * Commit step for an Event Promotion purchase — mirrors
 * activatePlacePromotion.ts exactly. Called only by finalizePaystackPayment
 * (injected as a paymentFulfillmentDeps step) once it has verified payment
 * for the given checkout. Never trusts a client-supplied duration/price —
 * everything comes from the already-priced event_promotion_checkout row and
 * the tier it references.
 *
 * **Server-only module function, not a Server Action** (same as
 * generateTicket.ts): a "use server" export is a directly POST-able endpoint,
 * and this one activates a promotion. It writes with the service-role client
 * (clients can't write the promotion tables — migration
 * lock_money_path_client_writes) and refuses unless a verified payment for
 * this checkout exists.
 */
export default async function activateEventPromotion(
  checkoutId: string,
  authOverride: AuthOverride,
) {
  const supabase = getSupabaseServiceClient();
  const userId = authOverride.userId;

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
    logger.error(
      `Failed fetching event promotion checkout: ${existingCheckoutError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if (!existingCheckout) {
    return { status: 404, message: "Checkout not found" };
  }

  if (
    !(await hasVerifiedPromotionPayment(
      "event_promotion_checkout_id",
      checkoutId,
      userId,
    ))
  ) {
    logger.error(
      `activateEventPromotion: no verified payment for checkout ${checkoutId}`,
    );
    return { status: 402, message: "Payment not verified for this checkout" };
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
    logger.error(
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
    logger.error(
      `Failed computing promotion end date: ${endsAtError?.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  const { error: insertError } = await supabase.from("event_promotion").insert({
    event_id: checkout.event_id,
    tier_id: tier.id,
    starts_at: startsAt.toISOString(),
    ends_at: computedEndsAt,
    promotion_checkout_id: checkout.id,
  });

  // 23505 = unique_violation on event_promotion_checkout_id_unique — a
  // previous run already created this promotion (e.g. a retried
  // fulfillment racing a webhook delivery). Treat it as already done rather
  // than a failure, so a retry can never create a second featured record.
  if (insertError && insertError.code !== "23505") {
    logger.error(`Failed activating event promotion: ${insertError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  await supabase
    .from("event_promotion_checkout")
    .update({ status: "paid", completed_at: new Date().toISOString() })
    .eq("id", checkout.id);

  const { data: event } = await supabase
    .from("event")
    .select("title, flyer_public_id, flyer_version, event_code")
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
      data: { kind: "event_featured", eventId: checkout.event_id },
      imagePublicId: event?.flyer_public_id ?? null,
      imageVersion: event?.flyer_version ?? null,
    },
    supabase,
  );

  // Every other payment-completion step (generateTicket.ts,
  // registerForFreeEvent.ts, updateEvent.ts) revalidates its own affected
  // routes right after success -- this one didn't, so the organizer's own
  // /manage/events/[eventId] promotion tab (server-rendered, not a client
  // query) could still show "pick a tier" instead of "Currently featured"
  // if they hit the browser Back button right after paying.
  revalidatePath(`/manage/events/${checkout.event_id}`);
  if (event?.event_code) {
    revalidatePath(`/events/${event.event_code.toLowerCase()}`);
  }

  return {
    status: 200,
    message: "Event is now featured",
    data: { endsAt: computedEndsAt },
  };
}
