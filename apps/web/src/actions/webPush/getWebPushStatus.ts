"use server";

import { createClient } from "@/config/supabase/server";
import { getWebPushStatusCore } from "@abonten/services/notifications/webPushCore";
import { webPushEndpointSchema } from "@abonten/validation/discoverySchemas";

/** Whether this browser's subscription belongs to the signed-in person. Web-only. */
export async function getWebPushStatus(input: unknown): Promise<{
  status: number;
  message?: string;
  data?: { subscribed: boolean };
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: 401, message: "Please sign in first." };

  const parsed = webPushEndpointSchema.safeParse(input);
  if (!parsed.success) return { status: 200, data: { subscribed: false } };
  return getWebPushStatusCore(user.id, parsed.data);
}
