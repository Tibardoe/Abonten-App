import { logger } from "@abonten/core/logger";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

// Post-auth body of the web deleteUser action, lifted so the mobile
// DELETE-account route runs it verbatim. The CALLER (web action / mobile
// route) is responsible for resolving + authenticating `userId` from the
// session first; this only performs the privileged deletion.
//
// What "deletion" means here (migration
// 20260913200100_account_deletion_preserves_records):
//   1. account_deletion_blockers() -- the person cannot leave while they
//      still owe attendees an upcoming event, while a payout is in flight,
//      while Abonten still owes them money, or if they are an admin. They
//      get a 409 that says which step to take first.
//   2. credit_close_account() -- pending rewards voided, balance forfeited.
//   3. anonymize_deleted_account() -- profile scrubbed, personal rows gone,
//      saved cards / payout accounts scrubbed, places unclaimed, events
//      cancelled or archived, status 'Deleted'.
//   4. auth.admin.deleteUser(id, shouldSoftDelete = true) -- Supabase Auth
//      removes sessions, identities and factors and obfuscates the email
//      and phone, but keeps the auth.users row. A hard delete would cascade
//      through user_info into transaction, ticket, organizer_ledger_entry,
//      payout and platform_fee_entry -- the financial record -- and into
//      every event the person organized, deleting other people's tickets.
//
// auth.admin.deleteUser needs the service-role key -- a user's own
// cookie/Bearer client can't remove an auth user -- so this is service-role
// only and must never be reachable from an unauthenticated path.

export type DeleteAccountResult = {
  status: 200 | 409 | 500;
  message: string;
};

type Blockers = {
  is_admin: boolean;
  upcoming_events_with_attendees: number;
  payouts_in_flight: number;
  balance_owed: number;
};

/** The reason a person must act before deleting, or null when they may. */
export function describeDeletionBlockers(b: Blockers): string | null {
  if (b.is_admin) {
    return "Admin accounts can't be deleted from here. Ask another admin to remove your admin access first.";
  }
  if (Number(b.upcoming_events_with_attendees) > 0) {
    return "You still have upcoming events with attendees. Cancel those events first so your attendees are refunded and told, then delete your account.";
  }
  if (Number(b.payouts_in_flight) > 0) {
    return "A payout to you is still being processed. Once it has completed you can delete your account.";
  }
  if (Number(b.balance_owed) > 0.005) {
    return "You still have earnings waiting to be paid out. Request a payout from Finances first, then delete your account once it has completed.";
  }
  return null;
}

export async function deleteAccountCore(
  userId: string,
  deps?: { serviceClient?: SupabaseClient<Database> },
): Promise<DeleteAccountResult> {
  const serviceClient = deps?.serviceClient ?? getSupabaseServiceClient();

  const { data: blockers, error: blockersError } = await serviceClient.rpc(
    "account_deletion_blockers",
    { p_user_id: userId },
  );
  if (blockersError || !blockers) {
    logger.error(
      `deleteAccountCore: account_deletion_blockers failed for ${userId}: ${blockersError?.message}`,
    );
    return { status: 500, message: "Something went wrong! Try again" };
  }

  const blocked = describeDeletionBlockers(blockers as unknown as Blockers);
  if (blocked) return { status: 409, message: blocked };

  // Close the Abonten Credit account first: pending rewards are voided and
  // any balance is forfeited in the ledger, which (deliberately) outlives
  // the account. Non-fatal -- the user asked to leave, and a failure here
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

  const { error: anonError } = await serviceClient.rpc(
    "anonymize_deleted_account",
    { p_user_id: userId },
  );
  if (anonError) {
    logger.error(
      `deleteAccountCore: anonymize_deleted_account failed for ${userId}: ${anonError.message}`,
    );
    return { status: 500, message: "Something went wrong! Try again" };
  }

  // Soft delete: sessions, identities, email and phone go; the row stays so
  // nothing cascades. The same email or number can sign up again as a new
  // account.
  const { error } = await serviceClient.auth.admin.deleteUser(userId, true);

  if (error) {
    logger.error(`Error deleting user: ${error.message}`);
    return { status: 500, message: "Something went wrong! Try again" };
  }

  return { status: 200, message: "Your account has been deleted." };
}
