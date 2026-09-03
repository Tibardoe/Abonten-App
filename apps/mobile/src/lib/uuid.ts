// A plain RFC-4122 v4 UUID string. Used for client-request idempotency keys
// (create_place / create_event's `p_client_request_id uuid` param) where the
// value only has to be unique and well-formed, not cryptographically
// unguessable — so this avoids depending on `crypto.randomUUID`, which
// isn't guaranteed on the React Native runtime.
export function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for a well-formed RFC-4122 UUID string. Used to reject a malformed
 * route/deep-link param before it reaches Postgres (where it would fail with
 * `invalid input syntax for type uuid` — a deterministic error the query
 * layer would otherwise retry).
 */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
