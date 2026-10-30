/**
 * Builds the sign-in URL for a protected-destination redirect (Flow A):
 * the user attempted to reach `returnTo` while unauthenticated, so it's
 * carried through as `next` and consumed after a successful sign-in.
 * The Header/SideBar Sign In/Sign Up links use it too (useSignInHref), so
 * signing in from an event page returns there; from Home they link to
 * plain "/auth/signin".
 */
export function getSignInUrl(returnTo: string): string {
  return `/auth/signin?next=${encodeURIComponent(returnTo)}`;
}
