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
