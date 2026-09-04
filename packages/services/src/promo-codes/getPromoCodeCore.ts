import { logger } from "@abonten/core/logger";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of getPromoCode — shared with validateCheckoutCore (and,
// through it, `/api/mobile/checkout/validate`). Caller supplies an already-
// authenticated Supabase client + resolved userId. Deliberately NOT a
// "use server" file (see validateCheckoutCore.ts).

const MAX_PROMO_LOOKUPS_PER_MINUTE = 20;

export type GetPromoCodeCoreResult =
  | { status: 400 | 401 | 404 | 429 | 500; message: string }
  | {
      status: 200;
      id: string;
      discountPercentage: number;
      remainingUses: number | null;
    };

export async function getPromoCodeCore(
  supabase: SupabaseClient,
  userId: string,
  code: string,
  eventId: string,
): Promise<GetPromoCodeCoreResult> {
  // A failed lookup leaves no row anywhere to run the usual "COUNT this
  // user's rows in the last hour" cap this codebase otherwise uses (see
  // submitReportCore) — codes are short, so unthrottled guessing could
  // brute-force one and claim its discount. Scoped per user, not per event,
  // since the guess space (any code on any event) is what matters.
  const allowed = await checkRateLimit(
    `promo-lookup:${userId}`,
    MAX_PROMO_LOOKUPS_PER_MINUTE,
    60,
  );

  if (!allowed) {
    return {
      status: 429,
      message: "Too many promo code attempts. Please try again shortly.",
    };
  }

  // Promo codes are unique per (event_id, normalized code), not globally, so
  // the lookup must be scoped by event_id and normalized the same way codes
  // are stored (upper/trim).
  const { data: promoCode, error: promoCodeError } = await supabase
    .from("promo_code")
    .select("*")
    .eq("event_id", eventId)
    .eq("promo_code", code.trim().toUpperCase())
    .maybeSingle();

  if (promoCodeError) {
    logger.error(`Error fetching promo code: ${promoCodeError.message}`);
    return {
      status: 500,
      message: `Error fetching promo code: ${promoCodeError.message}`,
    };
  }

  if (!promoCode) {
    return { status: 404, message: "Promo code is invalid!" };
  }

  if (promoCode.is_active === false) {
    return { status: 401, message: "Promo code is no longer active!" };
  }

  if (promoCode.expires_at && new Date(promoCode.expires_at) < new Date()) {
    return { status: 401, message: "Promo code has expired!" };
  }

  const { data: promoCodeUsage, error: promoCodeUsageError } = await supabase
    .from("promo_code_usage")
    .select("promo_code_id")
    .eq("promo_code_id", promoCode.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (promoCodeUsageError) {
    logger.error(promoCodeUsageError.message);
    return {
      status: 500,
      message: `Error fetching promo code usage: ${promoCodeUsageError.message}`,
    };
  }

  if (promoCodeUsage) {
    return { status: 400, message: "You have already used this promo code" };
  }

  // max_uses is nullable and means "unlimited" — remainingUses stays null in
  // that case so callers never treat an unlimited code as exhausted.
  const remainingUses =
    promoCode.max_uses === null
      ? null
      : Math.max(0, promoCode.max_uses - promoCode.times_used);

  if (remainingUses !== null && remainingUses <= 0) {
    return { status: 401, message: "Promo code has reached its usage limit!" };
  }

  return {
    status: 200,
    id: promoCode.id,
    discountPercentage: promoCode.discount_percentage,
    remainingUses,
  };
}
