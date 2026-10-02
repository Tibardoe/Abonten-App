"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { registerWebPushSubscriptionCore } from "@abonten/services/notifications/webPushCore";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { webPushSubscriptionSchema } from "@abonten/validation/discoverySchemas";

/**
 * Saves this browser's push subscription for the signed-in person.
 * Web-only (the app registers Expo tokens via /api/mobile/devices).
 */
export const registerWebPushSubscription = withActionLocale(
  async function registerWebPushSubscription(
    input: unknown,
  ): Promise<{ status: number; message?: string }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("pleaseSignInFirst") };

    const parsed = webPushSubscriptionSchema.safeParse(input);
    if (!parsed.success) {
      return {
        status: 400,
        message: tr("thisBrowserSSubscriptionIsnT"),
      };
    }
    if (!(await checkRateLimit(`web-push:user:${user.id}`, 20, 3600))) {
      return { status: 429, message: tr("tryAgainInALittleWhile") };
    }
    return registerWebPushSubscriptionCore(user.id, parsed.data);
  },
);
