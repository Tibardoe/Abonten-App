"use server";

import { createClient } from "@/config/supabase/server";
import { registerWebPushSubscriptionCore } from "@abonten/services/notifications/webPushCore";
import { checkRateLimit } from "@abonten/services/security/rateLimit";
import { webPushSubscriptionSchema } from "@abonten/validation/discoverySchemas";

/**
 * Saves this browser's push subscription for the signed-in person.
 * Web-only (the app registers Expo tokens via /api/mobile/devices).
 */
export async function registerWebPushSubscription(
  input: unknown,
): Promise<{ status: number; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "Please sign in first." };

  const parsed = webPushSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, message: "This browser's subscription isn't valid." };
  }
  if (!(await checkRateLimit(`web-push:user:${user.id}`, 20, 3600))) {
    return { status: 429, message: "Try again in a little while." };
  }
  return registerWebPushSubscriptionCore(user.id, parsed.data);
}
