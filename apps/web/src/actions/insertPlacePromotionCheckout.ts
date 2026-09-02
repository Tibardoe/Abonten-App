"use server";

import { createClient } from "@/config/supabase/server";
import { insertPlacePromotionCheckoutCore } from "@abonten/services/places/placePromotionCore";

/**
 * Reserve step for a Featured Places purchase — the place equivalent of
 * insertEventPromotionCheckout.ts. Never trusts a client-supplied price: the
 * unit/total price always comes from the already-seeded place_promotion_tier
 * row. Query body shared with the mobile
 * POST /api/mobile/organizer/places/:placeId/promote route via
 * @/utils/placePromotionCore.
 */
export default async function insertPlacePromotionCheckout(
  placeId: string,
  tierId: number,
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return {
      status: 500 as const,
      message: `Error fetching user: ${userError.message} `,
    };
  }

  if (!user) {
    return { status: 401 as const, message: "User not authenticated" };
  }

  const result = await insertPlacePromotionCheckoutCore(
    supabase,
    user.id,
    placeId,
    tierId,
  );

  // Preserve the original action's `{ status, data: { id } }` shape for its
  // existing web caller (ManagePlacePromotionSection).
  if (result.status === 200) {
    return { status: 200 as const, data: { id: result.checkoutId } };
  }
  return result;
}
