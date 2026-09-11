"use server";

import { createClient } from "@/config/supabase/server";
import { getLoyaltyProgressCore } from "@abonten/services/rewards/loyaltyCore";
import type { LoyaltyProgress } from "@abonten/types/rewards";

/**
 * The signed-in user's count towards the next loyalty fee rebate (null data
 * while it isn't live). Same service as GET /api/mobile/rewards/loyalty.
 */
export async function getLoyaltyProgress(): Promise<{
  status: number;
  message?: string;
  data?: LoyaltyProgress | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "User not logged in" };

  return getLoyaltyProgressCore(user.id);
}
