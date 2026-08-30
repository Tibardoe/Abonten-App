/**
 * Validates a `next` redirect target so it can only ever point back into
 * this app. Rejects anything that isn't a same-origin relative path
 * (e.g. protocol-relative URLs like "//evil.com" or absolute URLs), which
 * would otherwise let an attacker craft an open-redirect link through
 * `/auth/signin?next=...`.
 */
export function getSafeRedirectPath(
  next: string | string[] | undefined,
): string | null {
  const value = Array.isArray(next) ? next[0] : next;

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  return value;
}
