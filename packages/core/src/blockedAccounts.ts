// The "Blocked accounts" list: the account-wide blocks a person made
// (conversation_block rows with no conversation). Web reads it through
// @abonten/services/profile/userBlockCore and mobile straight from Supabase
// (conversation_block_own_select); both use this select and mapper.

export type BlockedAccount = {
  userId: string;
  username: string | null;
  fullName: string | null;
  avatarPublicId: string | null;
  avatarVersion: string | null;
  /** The account was deleted — no name or photo to show. */
  deleted: boolean;
  blockedAt: string;
};

/** The most shown at once; nobody realistically blocks more. */
export const BLOCKED_ACCOUNTS_LIMIT = 500;

export const BLOCKED_ACCOUNTS_SELECT =
  "created_at, blocked_id, blocked:user_info!conversation_block_blocked_id_fkey(username, full_name, avatar_public_id, avatar_version, status_id)";

export type BlockedAccountRow = {
  created_at: string;
  blocked_id: string;
  blocked: {
    username: string | null;
    full_name: string | null;
    avatar_public_id: string | null;
    avatar_version: string | null;
    status_id: number;
  } | null;
};

export function toBlockedAccount(row: BlockedAccountRow): BlockedAccount {
  const deleted = row.blocked?.status_id === 4;
  return {
    userId: row.blocked_id,
    username: deleted ? null : (row.blocked?.username ?? null),
    fullName: deleted ? null : (row.blocked?.full_name ?? null),
    avatarPublicId: deleted ? null : (row.blocked?.avatar_public_id ?? null),
    avatarVersion: deleted ? null : (row.blocked?.avatar_version ?? null),
    deleted,
    blockedAt: row.created_at,
  };
}

export function blockedAccountName(account: BlockedAccount): string {
  if (account.deleted) return "Former Abonten member";
  return account.fullName || account.username || "Abonten member";
}
