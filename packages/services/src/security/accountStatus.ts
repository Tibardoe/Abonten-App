import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// user_info.status_id: 1 active, 2 suspended, 3 banned, 4 deleted.
const RESTRICTED = new Set([2, 3, 4]);

/**
 * Whether `userId` may not create or change anything. The database's
 * guard_restricted_account trigger enforces this for writes made with the
 * person's own session; writes the service makes with the service role (no
 * auth.uid()) must ask here first. Read with the service role so it answers
 * the same whichever client the caller holds. Fails open on a read error,
 * like the transports' own checks: a transient failure must not lock
 * legitimate people out.
 */
export async function isAccountRestricted(userId: string): Promise<boolean> {
  const { data, error } = await getSupabaseServiceClient()
    .from("user_info")
    .select("status_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    logger.error(`accountStatus: status read failed (${error.message})`);
    return false;
  }
  return !!data && RESTRICTED.has(data.status_id);
}

export const RESTRICTED_ACCOUNT_MESSAGE =
  "Your account has been restricted. Contact support if you think this is a mistake.";
