// A place whose owner's account was deleted has nobody behind it (migration
// 20261125140000). It stays listed, unclaimed, and anyone may claim it;
// until then it takes no messages and no booking requests, because nobody
// would read them. The place page shows the claim path where Message was.
// The database refuses a new conversation too (open_conversation), and the
// booking service refuses a request.

/** user_status id of a deleted account (anonymize_deleted_account). */
export const DELETED_ACCOUNT_STATUS = 4;

/** The owner's account as a place read embeds it (user_info.status_id). */
export type PlaceOwnerRef = { status_id?: number | null } | null | undefined;

/**
 * Whether someone is behind the place. An owner the read did not include
 * (an older cached copy) counts as present: the server still refuses.
 */
export function placeHasOwner(owner: PlaceOwnerRef): boolean {
  return owner?.status_id !== DELETED_ACCOUNT_STATUS;
}

/**
 * The embed that answers it, for a place read through the Data API:
 * `select("*, owner:user_info!place_owner_id_fkey(status_id, is_admin)")`.
 * `is_admin` says whether Abonten's own staff listed it (placeClaimInvite).
 * user_info is publicly readable, so a signed-out read works too.
 */
export const PLACE_OWNER_EMBED =
  "owner:user_info!place_owner_id_fkey(status_id, is_admin)";
