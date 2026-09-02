"use server";

import { createClient } from "@/config/supabase/server";
import { createNotificationCore } from "@abonten/services/notifications/createNotification";
import type { CreateNotificationInput } from "@abonten/types/notificationType";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Thin web wrapper over
 * `@abonten/services/notifications/createNotification`'s
 * `createNotificationCore` — kept as a "use server" file only for this
 * repo's action-calling-action convention. It must only ever be imported
 * and called from other server-side action files, never from "use client"
 * code (it performs no auth check of its own).
 *
 * `supabaseOverride` lets a caller with no cookie session (webhooks, cron)
 * pass its own service-role client; otherwise a cookie client is used. Code
 * that already holds a Supabase client should import `createNotificationCore`
 * directly instead of going through this wrapper.
 */
export default async function createNotification(
  input: CreateNotificationInput,
  supabaseOverride?: SupabaseClient,
) {
  const supabase = supabaseOverride ?? (await createClient());
  return createNotificationCore(supabase, input);
}
