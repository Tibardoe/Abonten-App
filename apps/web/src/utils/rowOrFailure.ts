// For a page's "does this exist?" lookup.
//
// The data client answers a lookup with { data, error } and never throws, so
// `if (!data) notFound()` treats a lookup that FAILED (the database was
// restarting, a timeout) as "no such row": every event and place page
// answered 404 for as long as the database was unreachable. To a visitor
// that reads "this event is gone"; to a search engine it is a reason to
// drop the page.
//
// This keeps the two apart: the row, or null when there really is none, and
// a thrown error when the lookup itself failed, which the framework answers
// with a 500 and the error screen ("This page didn't load. Try again").

type Lookup = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

// What .single() reports when no row matched: an answer, not a failure.
const NO_ROWS = "PGRST116";

export function rowOrFailure<R extends Lookup>(
  result: R,
  what: string,
): R["data"] {
  if (result.error && result.error.code !== NO_ROWS) {
    throw new Error(`${what} lookup failed: ${result.error.message}`);
  }
  return result.data;
}
