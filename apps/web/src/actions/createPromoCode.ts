"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type CreatePromoCodeCoreResult,
  createPromoCodeCore,
} from "@abonten/services/promo-codes/eventPromoCodeManageCore";

type CreatePromoCodeInput = {
  eventId: string;
  promoCode: string;
  discountPercentage: number;
  maxUses: number | null;
  /** The last day the code works, as YYYY-MM-DD (the event's calendar). */
  expiresAt: string;
};

// Thin wrapper: auth, then delegate to the shared body (also used by the
// mobile POST /api/mobile/organizer/events/:eventId/promo-codes route).
export const createPromoCode = withActionLocale(async function createPromoCode(
  input: CreatePromoCodeInput,
): Promise<CreatePromoCodeCoreResult | { status: 401; message: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { status: 401, message: tr("userNotLoggedIn") };
  }

  return createPromoCodeCore(supabase, user.id, input);
});
