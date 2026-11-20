// Complimentary tickets (docs/architecture/complimentary-tickets.md): a
// ticket the organizer gave away carries { complimentary: true } in
// ticket.metadata (written by issue_complimentary_tickets).

/** The ticket was given away by the organizer, not bought. */
export function isComplimentary(metadata: unknown): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    (metadata as { complimentary?: unknown }).complimentary === true
  );
}
