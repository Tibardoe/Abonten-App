import { logger } from "@abonten/core/logger";
import type { CreateNotificationInput } from "@abonten/types/notificationType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUser } from "./sendPushNotification";

/**
 * Writes one notification row for `input.userId` and fires a best-effort
 * mobile push for the same event. NOT a public mutation endpoint — it
 * performs no auth check of its own (a client-invokable version could spam
 * arbitrary users), so it is only ever called from other server-side code
 * that has already resolved and authorised the caller.
 *
 * The caller passes the Supabase client to use: an ordinary cookie/Bearer
 * client for the "notify myself as a side effect of my own action" case, or
 * a service-role client for webhook / cron paths that have no session. The
 * target user is always `input.userId`, never "whoever is signed in".
 */
export async function createNotificationCore(
  supabase: SupabaseClient,
  input: CreateNotificationInput,
): Promise<{ status: number; message?: string }> {
  const { error } = await supabase.from("notification").insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    data: input.data ?? {},
    image_public_id: input.imagePublicId ?? null,
    image_version: input.imageVersion ?? null,
  });

  if (error) {
    logger.error(`Failed creating notification: ${error.message}`);
    return { status: 500, message: "Something went wrong!" };
  }

  // Best-effort mobile push for the same event. Never blocks or fails the
  // in-app notification write — sendPushToUser swallows all its own errors,
  // and a no-token user is a cheap no-op. `data` (kind + entity ids) rides
  // along so a push tap can route natively without parsing `link`.
  await sendPushToUser(input.userId, {
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
    data: input.data ?? {},
  }).catch(() => {});

  return { status: 200 };
}
