import type { ParsedSearchQuery } from "@abonten/types/searchType";

// Client-side mirror of the SQL _search_normalize() + "@handle" detection in
// supabase/migrations/20260913090000_search_v2_foundation.sql. The database
// is the authority (mobile calls search_suggest directly); this exists so the
// UI can show the organizer-mode chip, pick the right result tab and decide
// when a query is long enough to send. It never builds SQL.

export const SEARCH_QUERY_MAX_LENGTH = 120;
export const SEARCH_MIN_TEXT_LENGTH = 2;

const CONTROL_CHARS = /\p{Cc}+/gu;
const HANDLE = /^@([\p{L}\p{N}_]{1,30})/u;

export function normalizeSearchQuery(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(CONTROL_CHARS, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_QUERY_MAX_LENGTH);
}

export function parseSearchQuery(
  raw: string | null | undefined,
): ParsedSearchQuery {
  const normalized = normalizeSearchQuery(raw);
  if (normalized.startsWith("@")) {
    const match = normalized.match(HANDLE);
    return {
      kind: "organizer",
      normalized,
      handle: match ? match[1] : null,
    };
  }
  return {
    kind: normalized.length === 0 ? "empty" : "text",
    normalized,
    handle: null,
  };
}

/** Whether a query is worth sending: "@x" needs one handle character, text two. */
export function isSearchableQuery(parsed: ParsedSearchQuery): boolean {
  if (parsed.kind === "organizer") return parsed.handle !== null;
  return parsed.normalized.length >= SEARCH_MIN_TEXT_LENGTH;
}

/** The handle shown in the UI, e.g. "@abonten". */
export function formatHandle(username: string): string {
  return `@${username}`;
}
