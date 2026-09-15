"use server";

import { createClient } from "@/config/supabase/server";
import { unregisterWebPushSubscriptionCore } from "@abonten/services/notifications/webPushCore";
import { webPushEndpointSchema } from "@abonten/validation/discoverySchemas";

/** Stops pushes to this browser for the signed-in person. Web-only. */
export async function unregisterWebPushSubscription(
  input: unknown,
): Promise<{ status: number; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "Please sign in first." };

  const parsed = webPushEndpointSchema.safeParse(input);
  if (!parsed.success) return { status: 400, message: "Invalid subscription" };
  return unregisterWebPushSubscriptionCore(user.id, parsed.data);
}
