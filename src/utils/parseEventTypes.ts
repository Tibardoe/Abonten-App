/**
 * `event.event_type` is a plain `text` column (see
 * supabase/migrations/20260810084821_remote_schema.sql), but two different
 * write paths disagree on what to put in it: the create_event RPC
 * (20260816232000_atomic_event_creation_and_scoped_promo_codes.sql) takes a
 * text[] parameter and inserts it directly, which Postgres serializes as its
 * native array literal (e.g. `{Music,Concert}` — not valid JSON), while
 * updateEvent.ts writes it through PostgREST as JSON text (`["Music"]`).
 * Existing rows can be in either format depending on which path last wrote
 * them, so this parses defensively instead of assuming JSON. This is an
 * app-side workaround for a real data/schema inconsistency, not a fix for
 * it — see PROJECT.md §7.6 discrepancies / flag to the team.
 */
export function parseEventTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value;

  if (typeof value !== "string" || value.length === 0) return [];

  if (value.startsWith("{") && value.endsWith("}")) {
    const inner = value.slice(1, -1);
    if (inner.length === 0) return [];
    return inner
      .split(",")
      .map((item) => item.trim().replace(/^"(.*)"$/, "$1"))
      .filter(Boolean);
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [String(parsed)];
  } catch {
    // Neither a Postgres array literal nor JSON — treat as a single tag.
    return [value];
  }
}
