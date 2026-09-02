"use server";

import { createClient } from "@/config/supabase/server";
import {
  type DeletePromoCodeCoreResult,
  deletePromoCodeCore,
} from "@abonten/services/promo-codes/eventPromoCodeManageCore";

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/promo-codes/delete route). A code that
// has already been redeemed is deactivated, not deleted, so usage history
// survives.
export async function deletePromoCode(
  promoCodeId: string,
): Promise<DeletePromoCodeCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  return deletePromoCodeCore(supabase, user.id, promoCodeId);
}
