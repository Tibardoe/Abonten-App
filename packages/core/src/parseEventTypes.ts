/**
 * `event.event_type` is a plain `text` column (see
 * supabase/migrations/20260810084821_remote_schema.sql). Two write paths
 * used to disagree on what to put in it: the create_event RPC took a text[]
 * parameter and inserted it directly, which Postgres serialized as its
 * native array literal (e.g. `{Music,Concert}` — not valid JSON), while
 * updateEvent.ts writes it through PostgREST as JSON text (`["Music"]`).
 * Fixed at the source in 20260902140000_fix_event_type_serialization.sql
 * (create_event now writes JSON text too, and existing rows were backfilled
 * to match) — this defensive parsing is kept as a harmless fallback rather
 * than removed, in case anything else ever writes the old format again.
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
