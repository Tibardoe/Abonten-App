import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Deliberately NOT a "use server" Server Action — see src/utils/ticketInventory.ts
// for why. These accept an arbitrary userId with no session binding of their
// own, so they must only ever be reached from server code that already
// resolved userId from the caller's own session and checked the checkout is
// theirs.
//
// Service role throughout: clients can no longer write promo_code_usage or
// promo_code.times_used (migration lock_promo_and_subscription_writes). Both
// used to be client-writable so this code could run as the buyer, which also
// let any signed-in user reset a code's usage count to 0 or delete their own
// "already used" row and apply a once-per-customer code again. (Claiming a
// code at checkout happens inside create_ticket_checkout.)

const MAX_CAS_ATTEMPTS = 5;

/**
 * Adjusts times_used by a signed delta WITHOUT touching the promo_code_usage
 * row (unlike releasePromoUsage, which deletes it). Used
 * when a single checkout line's quantity changes after the usage row already
 * exists — the user has still "used" the code for this event regardless of
 * how many units it currently covers, so that row's lifecycle is managed
 * separately (see updateTicketCheckoutQuantity.ts / deleteTicketSummaryCheckout.ts).
 * A positive delta is bound-checked against max_uses, same as the claim in
 * create_ticket_checkout; a non-positive delta is floored at 0, same as
 * releasePromoUsage. Same CAS retry pattern as both.
 */
export async function adjustPromoUsageUnits(
  promoCodeId: string,
  unitsDelta: number,
) {
  if (unitsDelta === 0) return { status: 200 };

  const supabase = getSupabaseServiceClient();

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const { data: promoCode, error: promoCodeError } = await supabase
      .from("promo_code")
      .select("times_used, max_uses")
      .eq("id", promoCodeId)
      .maybeSingle();

    if (promoCodeError || !promoCode || promoCode.times_used === null) {
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
 * Compensating action for the promo claim in create_ticket_checkout: gives back a redemption that was
 * claimed for a checkout that ultimately failed, expired, or was cancelled
 * before payment — same role releaseTicketQuantity plays for inventory.
 * Uses a compare-and-swap update on times_used, retried on
 * contention, for the same reason: a plain read-then-write loses
 * increments when two releases race.
 */
export async function releasePromoUsage(
  promoCodeId: string,
  userId: string,
  eventId: string,
  unitsToRelease: number,
) {
  if (unitsToRelease <= 0) return;

  const supabase = getSupabaseServiceClient();

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

    if (promoCodeError || !promoCode || promoCode.times_used === null) return;

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

/**
 * Drops the buyer's "already used this code" row without changing the usage
 * count (the count was already adjusted line by line). Callers have checked
 * that no other pending/paid line of theirs still carries the discount.
 */
export async function forgetPromoUsage(
  promoCodeId: string,
  userId: string,
  eventId: string,
) {
  const { error } = await getSupabaseServiceClient()
    .from("promo_code_usage")
    .delete()
    .eq("promo_code_id", promoCodeId)
    .eq("user_id", userId)
    .eq("event_id", eventId);

  if (error) {
    logger.error(`Failed clearing promo usage row: ${error.message}`);
  }
}
