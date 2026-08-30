// Client-only "recent searches" history for the search bar's empty-state
// dropdown (Part 11 of the autocomplete spec). Deliberately minimal: just the
// typed search text, capped, newest first, stored in localStorage (per
// browser, never sent to the server) — no account/analytics storage needed
// for something this low-stakes. Every call is wrapped in try/catch since
// localStorage can throw (private browsing, storage disabled).

const STORAGE_KEY = "abonten:recent-searches";
const MAX_ENTRIES = 8;

export function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return getRecentSearches();

  const existing = getRecentSearches().filter(
    (entry) => entry.toLowerCase() !== trimmed.toLowerCase(),
  );
  const next = [trimmed, ...existing].slice(0, MAX_ENTRIES);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore — storage unavailable
  }
  return next;
}

export function removeRecentSearch(query: string): string[] {
  const next = getRecentSearches().filter((entry) => entry !== query);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore — storage unavailable
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore — storage unavailable
  }
}
