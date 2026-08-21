"use server";

import { createClient } from "@/config/supabase/server";
import type { CreateNotificationInput } from "@/types/notificationType";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Internal helper for writing one notification row — NOT a public mutation
 * endpoint. It is a "use server" file only for consistency with the rest of
 * this repo's action-calling-action convention (e.g. getNearByEvents.tsx
 * importing getEventAttendanceCounts from getAttendace.ts); it must only
 * ever be imported and called from other server-side action files, never
 * from "use client" code, since it performs no auth check of its own and a
 * client-invokable version of this could be used to spam arbitrary users.
 *
 * Accepts an optional pre-built Supabase client (`supabaseOverride`) for the
 * same reason generateTicket.ts/ticketPurchaseNotification.ts accept
 * `authOverride` — some callers (webhooks, cron jobs) run with no cookie
 * session, so they pass in their own service-role client instead of relying
 * on createClient() here. Unlike AuthOverride, no userId override is needed:
 * the target user is always the notification's own `userId` argument, not
 * "whoever is signed in".
 */
export default async function createNotification(
  input: CreateNotificationInput,
  supabaseOverride?: SupabaseClient,
) {
  const supabase = supabaseOverride ?? (await createClient());

  const { error } = await supabase.from("notification").insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
  });

  if (error) {
    console.log(`Failed creating notification: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  return { status: 200 };
}
