// The one primary action at the foot of an event page, decided in one
// place so the sticky bar can never offer something the rest of the page
// says is impossible. The inputs are the facts the page already computes
// (resolveOccurrenceState, getEventSoldOutStatus, the viewer's tickets).
// The label for each kind lives under `eventCta.*` of the core namespace.

import type { CoreTranslator } from "./i18n/translator";

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

export type EventCtaInput = {
  canceled: boolean;
  ended: boolean;
  inProgressNoFuture: boolean;
  soldOut: boolean;
  ticketTypeCount: number;
  isFree: boolean;
  /** The viewer holds a live ticket for this event. */
  attending: boolean;
};

/** Which action applies, before any words are attached. */
export function resolveEventCtaKind(input: EventCtaInput): EventCtaKind {
  if (input.canceled) return "canceled";
  // A ticket already held stays reachable even once sales have closed —
  // that is exactly when someone at the door needs it.
  if (input.attending) return "going";
  if (input.ended) return "ended";
  if (input.inProgressNoFuture) return "in_progress";
  if (input.soldOut) return "sold_out";
  if (input.ticketTypeCount === 0) return "no_tickets";
  return input.isFree ? "rsvp" : "buy";
}

const ACTIONABLE: Record<EventCtaKind, boolean> = {
  buy: true,
  rsvp: true,
  going: true,
  canceled: false,
  ended: false,
  in_progress: false,
  sold_out: false,
  no_tickets: false,
};

export function eventCtaLabel(t: CoreTranslator, kind: EventCtaKind): string {
  return t(`eventCta.${kind}`);
}

export function resolveEventCta(
  t: CoreTranslator,
  input: EventCtaInput,
): EventCta {
  const kind = resolveEventCtaKind(input);
  return { kind, label: eventCtaLabel(t, kind), actionable: ACTIONABLE[kind] };
}
