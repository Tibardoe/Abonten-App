// The `p_account` argument of the organizer money functions (team
// accounts, stage 3): the account a request reports on. Left out when no
// account is named, so the function answers for the signed-in person; the
// person's own id is accepted too. The database checks it
// (public.acting_account_for); this only names it.
export function accountArg(accountId: string | null | undefined): {
  p_account?: string;
} {
  return accountId ? { p_account: accountId } : {};
}
