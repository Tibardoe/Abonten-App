// Shared cursor-pagination config and helpers for events-domain Server
// Actions. Cursors are opaque to the client — always re-decoded and
// re-validated server-side, never trusted as raw query params.

export const DEFAULT_EVENTS_PAGE_SIZE = 20;

export function encodeCursor<T extends object>(payload: T): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export function decodeCursor<T extends object>(
  cursor: string | null | undefined,
): T | null {
  if (!cursor) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8"),
    );
    return parsed && typeof parsed === "object" ? (parsed as T) : null;
  } catch {
    // Malformed/tampered cursor — fall back to "first page" rather than
    // erroring, since a bad cursor can't be used to skip validation.
    return null;
  }
}

// Given `pageSize + 1` rows fetched from the DB, split into the page to
// return and whether another page exists — avoids a separate COUNT(*).
export function splitPage<T>(
  rows: T[],
  pageSize: number,
): { page: T[]; hasNextPage: boolean } {
  const hasNextPage = rows.length > pageSize;
  return { page: hasNextPage ? rows.slice(0, pageSize) : rows, hasNextPage };
}

/**
 * PostgREST keyset predicate for descending (sortColumn, idColumn)
 * pagination on a plain table query — the standard `.or()` idiom for
 * resuming "ORDER BY sortColumn DESC, id DESC" without an RPC. Values are
 * ISO timestamps/UUIDs, which contain no commas, so no escaping is needed
 * for PostgREST's or-filter syntax.
 */
export function keysetOlderThan(
  sortColumn: string,
  idColumn: string,
  cursor: { sortValue: string; id: string },
): string {
  return `${sortColumn}.lt.${cursor.sortValue},and(${sortColumn}.eq.${cursor.sortValue},${idColumn}.lt.${cursor.id})`;
}
