import { StatusPill } from "./StatusPill";
import type { StatusKind } from "./status";

// Ticket-aware wrapper over the shared <StatusPill> / status registry. The
// four real ticket.status values (active | used | expired | cancelled) plus
// the event-lifecycle overrides that can make "Active" the wrong thing to
// say for a still-held ticket. Rendering (tinted surface, icon, wording)
// comes from the shared system so a ticket status looks identical to the
// same state on Finances / Transactions.

export type TicketStatusBadgeProps = {
  /** Raw ticket.status — active | used | expired | cancelled. */
  status: string;
  /** Organizer cancelled the whole event (vs. the attendee cancelling just
   * this ticket) — both land on status="cancelled". */
  cancelledByOrganizer?: boolean;
  /** The event itself was cancelled — overrides "Active" on a held ticket. */
  eventCancelled?: boolean;
  /** Every session of the event is in the past — reads as "Ended". */
  eventEnded?: boolean;
  className?: string;
};

function resolve(props: TicketStatusBadgeProps): {
  kind: StatusKind;
  label?: string;
} {
  switch (props.status) {
    case "cancelled":
      return {
        kind: "cancelled",
        label: props.cancelledByOrganizer
          ? "Cancelled by organizer"
          : "Cancelled",
      };
    case "used":
      return { kind: "used", label: "Checked in" };
    case "expired":
      return { kind: "expired" };
    default:
      if (props.eventCancelled)
        return { kind: "cancelled", label: "Event cancelled" };
      if (props.eventEnded) return { kind: "ended" };
      return { kind: "active" };
  }
}

export function TicketStatusBadge(props: TicketStatusBadgeProps) {
  const { kind, label } = resolve(props);
  return (
    <StatusPill
      status={kind}
      options={{ fallback: kind, label }}
      className={props.className}
    />
  );
}
