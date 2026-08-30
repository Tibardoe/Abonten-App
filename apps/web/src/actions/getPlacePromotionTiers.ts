"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import { logger } from "@/utils/logger";
import type { PlacePromotionTier } from "@abonten/types/placeType";

// place_promotion_tier is a small, seeded lookup table (4 rows -- 24 hours/
// 3 days/7 days/1 month) -- mirrors getPlaceCategories.ts's plain
// unpaginated public read exactly, per the migration's own "don't hardcode
// pricing" reasoning.
export async function getPlacePromotionTiers() {
  const supabase = publicSupabase;

  const { data, error } = await supabase
    .from("place_promotion_tier")
    .select("*")
    .eq("is_active", true)
    .order("id");

  if (error) {
    logger.error(`Error fetching place promotion tiers: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (data ?? []) as PlacePromotionTier[] };
}
