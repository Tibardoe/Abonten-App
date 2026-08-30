/**
 * Builds the sign-in URL for a protected-destination redirect (Flow A):
 * the user attempted to reach `returnTo` while unauthenticated, so it's
 * carried through as `next` and consumed after a successful sign-in.
 * Voluntary sign-in entry points (Header/SideBar's generic Sign In/Sign Up)
 * intentionally link to plain "/auth/signin" instead — see CLAUDE.md/plan.
 */
export function getSignInUrl(returnTo: string): string {
  return `/auth/signin?next=${encodeURIComponent(returnTo)}`;
}
