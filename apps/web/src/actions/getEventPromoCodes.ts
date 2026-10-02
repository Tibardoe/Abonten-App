"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import {
  type EventPromoCode,
  type EventPromoCodesCoreResult,
  fetchEventPromoCodes,
} from "@abonten/services/promo-codes/eventPromoCodeManageCore";

export type { EventPromoCode } from "@abonten/services/promo-codes/eventPromoCodeManageCore";

// Thin wrapper: auth, then delegate to the shared body used by the mobile
// GET /api/mobile/organizer/events/:id/promo-codes route too — no fork.
export const getEventPromoCodes = withActionLocale(
  async function getEventPromoCodes(
    eventId: string,
  ): Promise<
    | EventPromoCodesCoreResult
    | { status: 401; message: string; data: EventPromoCode[] }
  > {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!user || userError) {
      return {
        status: 401,
        message: tr("userNotLoggedIn"),
        data: [],
      };
    }

    return fetchEventPromoCodes(supabase, user.id, eventId);
  },
);
