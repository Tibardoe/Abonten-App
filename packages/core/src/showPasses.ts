// Passes for several shows of a run (docs/architecture/show-passes.md).
//
// A pass is a ticket type of a run with `pass_shows` = N, sold on every
// show at the pass price. The ticket bought admits to the show it was
// bought on and lets its holder choose N - 1 other shows of the run; each
// choice is a ticket for that show (ticket_pass_claim). Shared by the
// service, the website and the app.

import { FREE_TICKET_TYPE, SINGLE_TICKET_TYPE } from "./ticketTiers";

export const MIN_PASS_SHOWS = 2;
export const MAX_PASS_SHOWS = 30;
export const MAX_PASS_NAME = 60;

/** One show of the run, as the pass holder sees it. */
export type PassShow = {
  eventId: string;
  eventCode: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  status: string;
  /** The show the pass was bought for (always one of its shows). */
  isBoughtShow: boolean;
  /** The ticket the pass holds for this show, if any. */
  ticketId: string | null;
  ticketStatus: string | null;
  /** The show sells this pass (it has a pass type of the same name). */
  hasPass: boolean;
  /** Places left for passes at this show; null = no limit. */
  passesLeft: number | null;
  started: boolean;
};

export type PassState = {
  passTicketId: string;
  passStatus: string;
  name: string;
  showsTotal: number;
  /** Shows this pass is already used for (the bought show counts). */
  showsUsed: number;
  boughtEventId: string;
  shows: PassShow[];
};

/** Shows the holder can still choose. */
export function passChoicesLeft(
  state: Pick<PassState, "showsTotal" | "showsUsed">,
) {
  return Math.max(0, state.showsTotal - state.showsUsed);
}

/** Whether this show can be chosen now with the pass. */
export function passShowChoosable(state: PassState, show: PassShow): boolean {
  return (
    (state.passStatus === "active" || state.passStatus === "used") &&
    passChoicesLeft(state) > 0 &&
    !show.isBoughtShow &&
    !show.ticketId &&
    !show.started &&
    show.status === "published" &&
    show.hasPass &&
    (show.passesLeft == null || show.passesLeft > 0)
  );
}

type Row = Record<string, unknown>;

/** The ticket_pass_state jsonb as typed state (null when not a pass). */
export function passStateFromRow(row: unknown): PassState | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Row;
  const shows = Array.isArray(r.shows) ? (r.shows as Row[]) : [];
  return {
    passTicketId: String(r.pass_ticket_id),
    passStatus: String(r.pass_status),
    name: String(r.name ?? ""),
    showsTotal: Number(r.shows_total ?? 0),
    showsUsed: Number(r.shows_used ?? 0),
    boughtEventId: String(r.bought_event_id),
    shows: shows.map((s) => ({
      eventId: String(s.event_id),
      eventCode: String(s.event_code ?? ""),
      startsAt: String(s.starts_at),
      endsAt: s.ends_at == null ? null : String(s.ends_at),
      timezone: String(s.timezone ?? "UTC"),
      status: String(s.status ?? ""),
      isBoughtShow: s.is_bought_show === true,
      ticketId: s.ticket_id == null ? null : String(s.ticket_id),
      ticketStatus: s.ticket_status == null ? null : String(s.ticket_status),
      hasPass: s.has_pass === true,
      passesLeft: s.passes_left == null ? null : Number(s.passes_left),
      started: s.started === true,
    })),
  };
}

export type PassSetupProblem = "name" | "shows" | "price" | "quantity";

/** What is wrong with a pass an organizer is setting up, if anything. */
export function passSetupProblem(input: {
  name: string;
  shows: number;
  price: number;
  quantity: number | null;
}): PassSetupProblem | null {
  const name = input.name.trim();
  if (
    name.length < 1 ||
    name.length > MAX_PASS_NAME ||
    [FREE_TICKET_TYPE, SINGLE_TICKET_TYPE].includes(name.toUpperCase())
  ) {
    return "name";
  }
  if (
    !Number.isInteger(input.shows) ||
    input.shows < MIN_PASS_SHOWS ||
    input.shows > MAX_PASS_SHOWS
  ) {
    return "shows";
  }
  if (!Number.isFinite(input.price) || input.price <= 0) return "price";
  if (
    input.quantity != null &&
    (!Number.isInteger(input.quantity) || input.quantity < 1)
  ) {
    return "quantity";
  }
  return null;
}
