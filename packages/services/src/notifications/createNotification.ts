import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "@abonten/services/supabase/serviceClient";
import type { Database } from "@abonten/types/database.types";
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
 * The `notification` table has RLS enabled with owner-only SELECT/UPDATE
 * and **no INSERT policy** (20260825105625_enable_rls_social_batch4), so a
 * normal session client — even the caller's own — cannot insert a row,
 * their own or anyone else's. Every notification write therefore goes
 * through the service-role client here. `input.userId` is the target; the
 * `supabase` param is kept only as a last-resort fallback if the
 * service-role env vars are somehow unset (e.g. an unusual test harness).
 */
export async function createNotificationCore(
  supabase: SupabaseClient<Database>,
  input: CreateNotificationInput,
): Promise<{ status: number; message?: string }> {
  let db: SupabaseClient<Database>;
  try {
    db = getSupabaseServiceClient();
  } catch (e) {
    logger.error(
      `createNotificationCore: service client unavailable, falling back to session client: ${e}`,
    );
    db = supabase;
  }

  const { error } = await db.from("notification").insert({
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
