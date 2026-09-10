import createNotification from "@/actions/createNotification";
import { getSupabaseServiceClient } from "@/config/supabase/serviceClient";
import { logger } from "@abonten/core/logger";
import type { AuthOverride } from "@abonten/types/authOverrideType";
import { revalidatePath } from "next/cache";
import { hasVerifiedPromotionPayment } from "./promotionPaymentProof";

/**
 * Commit step for a Featured Places purchase — the place equivalent of
 * activateEventPromotion.ts. Called only by finalizePaystackPayment
 * (injected as a paymentFulfillmentDeps step) once it has verified payment
 * for the given checkout. Never trusts a client-supplied duration/price —
 * everything comes from the already-priced place_promotion_checkout row and
 * the tier it references.
 *
 * **Server-only module function, not a Server Action** — see
 * activateEventPromotion.ts. Writes with the service-role client and refuses
 * unless a verified payment for this checkout exists.
 */
export default async function activatePlacePromotion(
  checkoutId: string,
  authOverride: AuthOverride,
) {
  const supabase = getSupabaseServiceClient();
  const userId = authOverride.userId;

  // Distinguish "never existed / wrong user" (404) from "existed but timed
  // out" (410) by checking existence BEFORE running the expiry sweep below —
  // mirrors activateEventPromotion.ts's initial-then-post-sweep read.
  const { data: existingCheckout, error: existingCheckoutError } =
    await supabase
      .from("place_promotion_checkout")
      .select("id")
      .eq("id", checkoutId)
      .eq("owner_id", userId)
      .maybeSingle();

  if (existingCheckoutError) {
    logger.error(
      `Failed fetching place promotion checkout: ${existingCheckoutError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if (!existingCheckout) {
    return { status: 404, message: "Checkout not found" };
  }

  if (
    !(await hasVerifiedPromotionPayment(
      "place_promotion_checkout_id",
      checkoutId,
      userId,
    ))
  ) {
    logger.error(
      `activatePlacePromotion: no verified payment for checkout ${checkoutId}`,
    );
    return { status: 402, message: "Payment not verified for this checkout" };
  }

  await supabase.rpc("expire_stale_place_promotion_checkouts");

  const { data: checkout, error: checkoutError } = await supabase
    .from("place_promotion_checkout")
    .select("*, place_promotion_tier(*)")
    .eq("id", checkoutId)
    .eq("owner_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (checkoutError) {
    logger.error(
      `Failed fetching place promotion checkout: ${checkoutError.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  if (!checkout) {
    return {
      status: 410,
      message: "This checkout has expired. Please start again.",
    };
  }

  const tier = checkout.place_promotion_tier;

  if (!tier) {
    return { status: 404, message: "Promotion tier not found" };
  }

  const startsAt = new Date();

  // tier.duration is a Postgres interval (e.g. "3 days", "1 mon") — computed
  // in the database via RPC rather than parsed/reimplemented in application
  // code, matching compute_subscription_end_date's exact reasoning.
  const { data: computedEndsAt, error: endsAtError } = await supabase.rpc(
    "compute_place_promotion_end_date",
    { p_tier_id: tier.id, p_from_date: startsAt.toISOString() },
  );

  if (endsAtError || !computedEndsAt) {
    logger.error(
      `Failed computing promotion end date: ${endsAtError?.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  const { error: insertError } = await supabase.from("place_promotion").insert({
    place_id: checkout.place_id,
    tier_id: tier.id,
    starts_at: startsAt.toISOString(),
    ends_at: computedEndsAt,
    promotion_checkout_id: checkout.id,
  });

  // 23505 = unique_violation on place_promotion_checkout_id_unique — a
  // previous run already created this promotion (e.g. a retried
  // fulfillment racing a webhook delivery). Treat it as already done rather
  // than a failure, so a retry can never create a second featured record.
  if (insertError && insertError.code !== "23505") {
    logger.error(`Failed activating place promotion: ${insertError.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  await supabase
    .from("place_promotion_checkout")
    .update({ status: "paid", completed_at: new Date().toISOString() })
    .eq("id", checkout.id);

  const { data: place } = await supabase
    .from("place")
    .select("name, slug, cover_public_id, cover_version")
    .eq("id", checkout.place_id)
    .maybeSingle();

  await createNotification(
    {
      userId,
      type: "promotion_started",
      title: "Your place is now featured",
      body: place?.name
        ? `${place.name} is now featured (${tier.duration_label}).`
        : `Your promotion is now active (${tier.duration_label}).`,
      link: `/manage/places/${checkout.place_id}`,
      data: {
        kind: "place_featured",
        placeId: checkout.place_id,
        placeSlug: place?.slug ?? undefined,
      },
      imagePublicId: place?.cover_public_id ?? null,
      imageVersion: place?.cover_version ?? null,
    },
    supabase,
  );

  // Same reasoning as activateEventPromotion.ts: this was the one
  // payment-completion step with no revalidatePath, leaving the
  // organizer's own /manage/places/[placeId] promotion tab able to show
  // stale "pick a tier" state after a Back-button navigation post-payment.
  revalidatePath(`/manage/places/${checkout.place_id}`);
  if (place?.slug) {
    revalidatePath(`/places/${place.slug}`);
  }

  return {
    status: 200,
    message: "Place is now featured",
    data: { endsAt: computedEndsAt },
  };
}
