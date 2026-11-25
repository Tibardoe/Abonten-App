// Deleting a team (docs/architecture/team-accounts.md §4o): every active
// Owner agrees, each after a fresh sign-in; the one who asks first types
// the team's name. The database keeps the same numbers
// (public.team_delete_request, team_deletion_blockers).

/** How long a request waits for the other Owners before it ends. */
export const TEAM_DELETE_REQUEST_DAYS = 7;

/**
 * An Owner removed or demoted by someone else in this many days stops a
 * request, so one Owner cannot clear the others out and delete alone.
 */
export const TEAM_OWNER_CHANGE_GUARD_DAYS = 7;

function comparable(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Whether what the Owner typed is the team's name: spaces and case do not
 * matter, anything else does. An empty name never matches.
 */
export function teamNameConfirmed(typed: string, teamName: string): boolean {
  const want = comparable(teamName);
  return want.length > 0 && comparable(typed) === want;
}

/** "Waiting for 1 of 3 Owners": how many still have to approve. */
export function ownersStillToApprove(
  owners: number,
  approvals: number,
): number {
  return Math.max(0, owners - approvals);
}
