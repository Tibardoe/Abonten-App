// The one primary action at the foot of an event page, decided in one
// place so the sticky bar can never offer something the rest of the page
// says is impossible. The inputs are the facts the page already computes
// (resolveOccurrenceState, getEventSoldOutStatus, the viewer's tickets).

export type EventCtaKind =
  | "buy" // paid tickets on sale
  | "rsvp" // free: reserve a spot
  | "going" // the viewer already holds a ticket
  | "canceled"
  | "ended"
  | "in_progress" // started, nothing later left to sell
  | "sold_out"
  | "no_tickets"; // nothing has been set up to sell yet

export type EventCta = {
  kind: EventCtaKind;
  /** The button's label, or the state shown in its place. */
  label: string;
  /** Whether it is an action at all (false = a disabled status). */
  actionable: boolean;
};

export function resolveEventCta(input: {
  canceled: boolean;
  ended: boolean;
  inProgressNoFuture: boolean;
  soldOut: boolean;
  ticketTypeCount: number;
  isFree: boolean;
  /** The viewer holds a live ticket for this event. */
  attending: boolean;
}): EventCta {
  if (input.canceled) {
    return { kind: "canceled", label: "Event canceled", actionable: false };
  }
  // A ticket already held stays reachable even once sales have closed —
  // that is exactly when someone at the door needs it.
  if (input.attending) {
    return { kind: "going", label: "View my ticket", actionable: true };
  }
  if (input.ended) {
    return { kind: "ended", label: "Event ended", actionable: false };
  }
  if (input.inProgressNoFuture) {
    return {
      kind: "in_progress",
      label: "Ticket sales closed",
      actionable: false,
    };
  }
  if (input.soldOut) {
    return { kind: "sold_out", label: "Sold out", actionable: false };
  }
  if (input.ticketTypeCount === 0) {
    return {
      kind: "no_tickets",
      label: "Tickets not available yet",
      actionable: false,
    };
  }
  return input.isFree
    ? { kind: "rsvp", label: "Reserve spot", actionable: true }
    : { kind: "buy", label: "Buy tickets", actionable: true };
}
