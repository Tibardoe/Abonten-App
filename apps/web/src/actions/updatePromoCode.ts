"use server";

import { createClient } from "@/config/supabase/server";
import {
  type UpdatePromoCodeCoreResult,
  updatePromoCodeCore,
} from "@/utils/eventPromoCodeManageCore";

type UpdatePromoCodeInput = {
  promoCodeId: string;
  discountPercentage: number;
  maxUses: number | null;
  expiresAt: Date;
  isActive: boolean;
};

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/promo-codes/update route). Only the
// terms of an existing code change here — never its text or event_id.
export async function updatePromoCode(
  input: UpdatePromoCodeInput,
): Promise<UpdatePromoCodeCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: "User not logged in" };
  }

  return updatePromoCodeCore(supabase, user.id, input);
}
