// The area a visitor last explored, so "Explore" / "Home" and the redirect
// after signing in go back there — without asking the browser for the
// visitor's position on every page load (the header used to, which put a
// location prompt in front of everyone and made a geocoding call per
// session). Kept in this browser only (localStorage); nothing is sent.

const KEY = "abn_explore_area";

/** Remember an /explore/<area> address (with lat/lng when it has them). */
export function rememberExploreArea(href: string): void {
  if (!href.startsWith("/explore/")) return;
  try {
    window.localStorage.setItem(KEY, href);
  } catch {
    // Private mode or blocked storage: nothing to remember.
  }
}

/** The last explored area's address, or null if none is remembered. */
export function readExploreArea(): string | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value?.startsWith("/explore/") ? value : null;
  } catch {
    return null;
  }
}
