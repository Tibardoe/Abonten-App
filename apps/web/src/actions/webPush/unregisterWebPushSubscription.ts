"use server";

import { createClient } from "@/config/supabase/server";
import { withActionLocale } from "@/i18n/withActionLocale";
import { tr } from "@abonten/services/i18n/requestLocale";
import { unregisterWebPushSubscriptionCore } from "@abonten/services/notifications/webPushCore";
import { webPushEndpointSchema } from "@abonten/validation/discoverySchemas";

/** Stops pushes to this browser for the signed-in person. Web-only. */
export const unregisterWebPushSubscription = withActionLocale(
  async function unregisterWebPushSubscription(
    input: unknown,
  ): Promise<{ status: number; message?: string }> {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: 401, message: tr("pleaseSignInFirst") };

    const parsed = webPushEndpointSchema.safeParse(input);
    if (!parsed.success)
      return { status: 400, message: tr("invalidSubscription") };
    return unregisterWebPushSubscriptionCore(user.id, parsed.data);
  },
);
