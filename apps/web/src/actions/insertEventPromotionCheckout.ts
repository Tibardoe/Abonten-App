"use server";

import { createClient } from "@/config/supabase/server";
import { insertEventPromotionCheckoutCore } from "@abonten/services/promotions/insertEventPromotionCheckoutCore";

/**
 * Reserve step for an Event Promotion purchase — mirrors
 * insertPlacePromotionCheckout.ts. Never trusts a client-supplied price: the
 * unit/total price always comes from the already-seeded event_promotion_tier
 * row. Query body shared with the mobile
 * POST /api/mobile/organizer/events/:id/promote route via
 * @/utils/insertEventPromotionCheckoutCore.
 */
export default async function insertEventPromotionCheckout(
  eventId: string,
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

  const result = await insertEventPromotionCheckoutCore(
    supabase,
    user.id,
    eventId,
    tierId,
  );

  // Preserve the original action's `{ status, data: { id } }` shape for its
  // existing web caller (ManageEventPromotionSection).
  if (result.status === 200) {
    return { status: 200 as const, data: { id: result.checkoutId } };
  }
  return result;
}
