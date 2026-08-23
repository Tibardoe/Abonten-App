"use server";

import { publicSupabase } from "@/config/supabase/publicClient";
import type { EventPromotionTier } from "@/types/postsType";

// event_promotion_tier is a small, seeded lookup table (4 rows -- 24 hours/
// 3 days/7 days/1 month) -- mirrors getPlacePromotionTiers.ts exactly.
export async function getEventPromotionTiers() {
  const supabase = publicSupabase;

  const { data, error } = await supabase
    .from("event_promotion_tier")
    .select("*")
    .eq("is_active", true)
    .order("id");

  if (error) {
    console.log(`Error fetching event promotion tiers: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200, data: (data ?? []) as EventPromotionTier[] };
}
