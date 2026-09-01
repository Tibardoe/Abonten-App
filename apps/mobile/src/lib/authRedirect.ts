// Where to send the user once they finish signing in, when they were bounced
// out of a protected screen. The web equivalent is the `?next=` query param
// that `getSignInUrl(pathname)` builds and `/auth/signin` consumes; here it's
// a module-level slot the route guard in app/_layout.tsx writes and reads.

let pending: string | null = null;

export function setPendingRedirect(path: string): void {
  pending = path;
}

export function consumePendingRedirect(): string | null {
  const value = pending;
  pending = null;
  return value;
}

// Screens that require a session. Anything not listed here renders for
// signed-out visitors too, matching the web app's public-route allowlist
// (`/`, `/events`, `/explore`, `/places`, `/search`, public profiles).
const PROTECTED_PREFIXES = [
  "/tickets",
  "/ticket/",
  "/wallet",
  "/account",
  "/notifications",
  "/checkout",
  "/organizer",
  "/settings",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname === prefix.replace(/\/$/, "") ||
      pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
  );
}
