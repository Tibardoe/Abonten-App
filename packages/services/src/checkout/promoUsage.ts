import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

// Deliberately NOT a "use server" Server Action — see src/utils/ticketInventory.ts
// for why. These accept an arbitrary userId with no session binding of their
// own, so they must only ever be reached through validateCheckout, which
// already resolves userId from the caller's own session.
//
// `client` is optional: the web (cookie-session) callers omit it and get a
// fresh cookie-bound client; the mobile API route path passes its already-
// authenticated Bearer client through validateCheckoutCore so the
// promo_code / promo_code_usage writes run as the same `authenticated`
// role + `auth.uid()` the RLS policies expect
// (promo_code_authenticated_usage_update, promo_code_usage_owner_*).

/**
 * Atomically claims `unitsToClaim` redemptions of a promo code for one
 * user/event, mirroring the compare-and-swap pattern in
 * reserveTicketQuantity: the times_used increment is guarded by
 * `.eq("times_used", <value just read>)`, so two concurrent checkouts
 * racing for the last remaining redemption can never both succeed.
 * The per-user promo_code_usage row (PK: promo_code_id, user_id, event_id)
 * additionally prevents the same user claiming twice.
 */
export async function claimPromoUsage(
  promoCodeId: string,
  userId: string,
  eventId: string,
  unitsToClaim: number,
  client: SupabaseClient,
) {
  const supabase = client;

  const { data: promoCode, error: promoCodeError } = await supabase
    .from("promo_code")
    .select("times_used, max_uses")
    .eq("id", promoCodeId)
    .maybeSingle();

  if (promoCodeError || !promoCode) {
    return { status: 404, message: "Promo code no longer exists" };
  }

  if (
    promoCode.max_uses !== null &&
    promoCode.times_used + unitsToClaim > promoCode.max_uses
  ) {
    return {
      status: 409,
      message: "Promo code has reached its usage limit!",
    };
  }

  const { error: usageInsertError } = await supabase
    .from("promo_code_usage")
    .insert({ promo_code_id: promoCodeId, user_id: userId, event_id: eventId });

  if (usageInsertError) {
    // Most likely the per-user PK already exists (already used this promo).
    return { status: 400, message: "You have already used this promo code" };
  }

  const { data: updated, error: updateError } = await supabase
    .from("promo_code")
    .update({ times_used: promoCode.times_used + unitsToClaim })
    .eq("id", promoCodeId)
    .eq("times_used", promoCode.times_used)
    .select("id");

  if (updateError || !updated || updated.length === 0) {
    // Lost the race for the last slot(s) — undo the usage row we just
    // inserted so this user isn't locked out of retrying.
    await supabase
      .from("promo_code_usage")
      .delete()
      .eq("promo_code_id", promoCodeId)
      .eq("user_id", userId)
      .eq("event_id", eventId);

    return {
      status: 409,
      message:
        "This promo code was just claimed by someone else. Please try again.",
    };
  }

  return { status: 200 };
}

const MAX_CAS_ATTEMPTS = 5;

/**
 * Adjusts times_used by a signed delta WITHOUT touching the promo_code_usage
 * row (unlike claimPromoUsage/releasePromoUsage, which create/delete it). Used
 * when a single checkout line's quantity changes after the usage row already
 * exists — the user has still "used" the code for this event regardless of
 * how many units it currently covers, so that row's lifecycle is managed
 * separately (see updateTicketCheckoutQuantity.ts / deleteTicketSummaryCheckout.ts).
 * A positive delta is bound-checked against max_uses, same as claimPromoUsage;
 * a non-positive delta is floored at 0, same as releasePromoUsage. Same CAS
 * retry pattern as both.
 */
export async function adjustPromoUsageUnits(
  supabase: SupabaseClient,
  promoCodeId: string,
  unitsDelta: number,
) {
  if (unitsDelta === 0) return { status: 200 };

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const { data: promoCode, error: promoCodeError } = await supabase
      .from("promo_code")
      .select("times_used, max_uses")
      .eq("id", promoCodeId)
      .maybeSingle();

    if (promoCodeError || !promoCode) {
      return { status: 404, message: "Promo code no longer exists" };
    }

    const newTimesUsed = Math.max(0, promoCode.times_used + unitsDelta);

    if (
      unitsDelta > 0 &&
      promoCode.max_uses !== null &&
      newTimesUsed > promoCode.max_uses
    ) {
      return {
        status: 409,
        message: "Promo code has reached its usage limit!",
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from("promo_code")
      .update({ times_used: newTimesUsed })
      .eq("id", promoCodeId)
      .eq("times_used", promoCode.times_used)
      .select("id");

    if (updateError) {
      logger.error(`Failed adjusting promo usage: ${updateError.message}`);
      return { status: 500, message: "Something went wrong!" };
    }

    if (updated && updated.length > 0) {
      return { status: 200 };
    }
    // 0 rows updated means another writer changed times_used between the
    // read and write above — retry with a fresh read instead of overwriting it.
  }

  return {
    status: 409,
    message:
      "This promo code was just claimed by someone else. Please try again.",
  };
}

/**
 * Compensating action for claimPromoUsage: gives back a redemption that was
 * claimed for a checkout that ultimately failed, expired, or was cancelled
 * before payment — same role releaseTicketQuantity plays for inventory.
 * Uses the same compare-and-swap update as claimPromoUsage, retried on
 * contention, for the same reason: a plain read-then-write loses
 * increments when two releases race.
 */
export async function releasePromoUsage(
  promoCodeId: string,
  userId: string,
  eventId: string,
  unitsToRelease: number,
  client: SupabaseClient,
) {
  if (unitsToRelease <= 0) return;

  const supabase = client;

  await supabase
    .from("promo_code_usage")
    .delete()
    .eq("promo_code_id", promoCodeId)
    .eq("user_id", userId)
    .eq("event_id", eventId);

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const { data: promoCode, error: promoCodeError } = await supabase
      .from("promo_code")
      .select("times_used")
      .eq("id", promoCodeId)
      .maybeSingle();

    if (promoCodeError || !promoCode) return;

    const newTimesUsed = Math.max(0, promoCode.times_used - unitsToRelease);

    const { data: updated, error: updateError } = await supabase
      .from("promo_code")
      .update({ times_used: newTimesUsed })
      .eq("id", promoCodeId)
      .eq("times_used", promoCode.times_used)
      .select("id");

    if (updateError) {
      logger.error(`Failed releasing promo usage: ${updateError.message}`);
      return;
    }

    if (updated && updated.length > 0) {
      return;
    }
    // 0 rows updated means another writer changed times_used between the
    // read and write above — retry with a fresh read instead of overwriting it.
  }

  logger.error(
    `Failed releasing ${unitsToRelease} promo usage unit(s) for ${promoCodeId} after ${MAX_CAS_ATTEMPTS} attempts (contention)`,
  );
}
