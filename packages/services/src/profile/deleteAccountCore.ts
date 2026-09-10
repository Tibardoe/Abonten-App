import { logger } from "@abonten/core/logger";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Post-auth body of the web deleteUser action, lifted so the mobile
// DELETE-account route runs it verbatim. The CALLER (web action / mobile
// route) is responsible for resolving + authenticating `userId` from the
// session first; this only performs the privileged deletion.
//
// auth.admin.deleteUser needs the service-role key — a user's own
// cookie/Bearer client can't remove an auth user — so this is service-role
// only and must never be reachable from an unauthenticated path.

export async function deleteAccountCore(
  userId: string,
): Promise<{ status: 200 | 500; message: string }> {
  const serviceClient = getSupabaseServiceClient();

  // Close the Abonten Credit account first: pending rewards are voided and
  // any balance is forfeited in the ledger, which (deliberately) outlives
  // the auth user. Non-fatal -- the user asked to leave, and a failure here
  // shows up in the credit reconciliation checks instead of blocking them.
  const { error: creditError } = await serviceClient.rpc(
    "credit_close_account",
    { p_user_id: userId, p_actor_type: "user", p_actor_id: userId },
  );
  if (creditError) {
    logger.error(
      `deleteAccountCore: credit_close_account failed for ${userId}: ${creditError.message}`,
    );
  }

  const { error } = await serviceClient.auth.admin.deleteUser(userId);

  if (error) {
    logger.error(`Error deleting user: ${error.message}`);
    return { status: 500, message: "Something went wrong! Try again" };
  }

  return { status: 200, message: "User deleted successfully!" };
}
