import { getCheckoutExpiryTimestamp } from "@abonten/core/checkoutExpiry";
import { logger } from "@abonten/core/logger";
import type { PlacePromotionTier } from "@abonten/types/placeType";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth bodies for the per-place Promotion tab (paid "Feature this
// Place"), lifted so the mobile routes run the same logic as the web
// manage/places/[placeId] page + insertPlacePromotionCheckout. Never trusts
// a client-supplied price — the unit/total price always comes from the
// seeded place_promotion_tier row. NOT a "use server" file.

// ---- context (tiers + current promotion) --------------------------

export type PlacePromotionContext = {
  tiers: PlacePromotionTier[];
  currentPromotion: { ends_at: string; tierLabel: string | null } | null;
};

export type PlacePromotionContextResult =
  | { status: 200; data: PlacePromotionContext }
  | { status: 403 | 404 | 500; message: string };

/**
 * Everything the Promotion tab needs in one owner-scoped read — mirrors
 * what manage/places/[placeId]/page.tsx assembles for
 * ManagePlacePromotionSection: the seeded tier list and whether the place
 * is currently featured (always computed from ends_at > now, never stored).
 * A place has no "ended" / "sold out" concept, so there is no eligibility
 * gate (matching the web section).
 */
export async function fetchPlacePromotionContext(
  supabase: SupabaseClient,
  userId: string,
  placeId: string,
): Promise<PlacePromotionContextResult> {
  const { data: place, error: placeError } = await supabase
    .from("place")
    .select("id, owner_id")
    .eq("id", placeId)
    .maybeSingle();

  if (placeError || !place) {
    return { status: 404, message: "Place not found" };
  }
  if (place.owner_id !== userId) {
    return { status: 403, message: "Not authorized to promote this place" };
  }

  const nowIso = new Date().toISOString();

  const [
    { data: tierRows, error: tierError },
    { data: activePromo, error: promoError },
  ] = await Promise.all([
    supabase
      .from("place_promotion_tier")
      .select("*")
      .eq("is_active", true)
      .order("id"),
    supabase
      .from("place_promotion")
      .select("ends_at, place_promotion_tier(duration_label)")
      .eq("place_id", placeId)
      .gt("ends_at", nowIso)
      .order("ends_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (tierError || promoError) {
    logger.error(
      `Error fetching place promotion context: ${
        tierError?.message ?? promoError?.message
      }`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  // postgrest infers the embed as an array here (no generated types); it's a
  // single row at runtime — same workaround the web page uses.
  const promo = activePromo as unknown as {
    ends_at: string;
    place_promotion_tier: { duration_label: string } | null;
  } | null;

  return {
    status: 200,
    data: {
      tiers: (tierRows ?? []) as PlacePromotionTier[],
      currentPromotion: promo
        ? {
            ends_at: promo.ends_at,
            tierLabel: promo.place_promotion_tier?.duration_label ?? null,
          }
        : null,
    },
  };
}

// ---- reserve step (pending place_promotion_checkout) --------------

export type InsertPlacePromotionCheckoutResult =
  | { status: 403 | 404 | 500; message: string }
  | {
      status: 200;
      checkoutId: string;
      tierLabel: string;
      amount: number;
      currency: string;
    };

/**
 * Post-auth body of insertPlacePromotionCheckout — creates a pending
 * place_promotion_checkout priced from the seeded tier (never the client).
 */
export async function insertPlacePromotionCheckoutCore(
  supabase: SupabaseClient,
  userId: string,
  placeId: string,
  tierId: number,
): Promise<InsertPlacePromotionCheckoutResult> {
  const { data: place, error: placeError } = await supabase
    .from("place")
    .select("id, owner_id")
    .eq("id", placeId)
    .maybeSingle();

  if (placeError || !place) {
    return { status: 404, message: "Place not found" };
  }
  if (place.owner_id !== userId) {
    return { status: 403, message: "Not authorized to promote this place" };
  }

  const { data: tier, error: tierError } = await supabase
    .from("place_promotion_tier")
    .select("*")
    .eq("id", tierId)
    .eq("is_active", true)
    .maybeSingle();

  if (tierError || !tier) {
    return { status: 404, message: "Promotion tier not found" };
  }

  const { data: checkout, error: insertError } = await supabase
    .from("place_promotion_checkout")
    .insert({
      place_id: placeId,
      owner_id: userId,
      tier_id: tier.id,
      unit_price: tier.price,
      total_price: tier.price,
      currency: tier.currency,
      status: "pending",
      expires_at: getCheckoutExpiryTimestamp(),
    })
    .select("id")
    .single();

  if (insertError || !checkout) {
    logger.error(
      `Error inserting place promotion checkout: ${insertError?.message}`,
    );
    return { status: 500, message: "Something went wrong!" };
  }

  return {
    status: 200,
    checkoutId: checkout.id as string,
    tierLabel: tier.duration_label as string,
    amount: tier.price as number,
    currency: tier.currency as string,
  };
}
