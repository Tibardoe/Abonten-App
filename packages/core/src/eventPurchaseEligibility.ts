import type { Occurrence } from "@abonten/types/occurrenceType";
import { formatSingleDateTime } from "./dateFormatter";
import type { EventStatus } from "./eventStatus";

// Per-occurrence breakdown of an event's schedule, plus the single
// "can a ticket be sold right now" decision derived from it. This is the
// authoritative shape behind the ticket-purchasing date rules.
//
// When online sales close for a session is the organizer's choice
// (event.sales_close_before_end_minutes, docs/architecture/
// ticket-sales-window.md):
//  - null (the default, how every event behaved before 2026-11-23): at the
//    session's start, so a ticket is only sold for a session that has not
//    started yet;
//  - N minutes (0, 30, 60 or 120): N minutes before the session ends, so
//    people can still buy while it is on ("Keep selling while it's on",
//    an amusement park open 11:00-19:00 that families decide to visit on
//    the day). Never earlier than the start: the choice only ever keeps
//    sales open longer than the default.
//
// The database applies the same rule in public.event_session_sales_close_at
// (migration 20261123090000_same_day_sales), which create_ticket_checkout,
// issue_free_ticket and the pass functions call: change the two together.
//
// getEventStatus() (eventStatus.ts) answers the coarse "upcoming | ongoing |
// ended" question for card overlays; this answers the finer question the
// checkout path needs — which specific occurrences are past / current /
// future, and which one a new purchase should attach to. The two use the
// same session-window normalisation and never disagree about `status`.

export type OccurrenceLike = {
  id?: string | null;
  starts_at: string | Date;
  ends_at: string | Date;
};

type NormalizedOccurrence<T extends OccurrenceLike> = {
  source: T;
  starts: number;
  ends: number;
  /** When online sales close for this session. */
  closes: number;
};

/** The minutes-before-the-end an organizer can pick (0 = until it ends). */
export const SALES_CLOSE_BEFORE_END_MINUTES = [0, 30, 60, 120] as const;
export type SalesCloseBeforeEndMinutes =
  (typeof SALES_CLOSE_BEFORE_END_MINUTES)[number];

/** null = sales close when the session starts (the default). */
export type SalesClose = SalesCloseBeforeEndMinutes | null;

export const DEFAULT_SALES_CLOSE: SalesClose = null;

export function isSalesCloseBeforeEndMinutes(
  value: unknown,
): value is SalesCloseBeforeEndMinutes {
  return (
    typeof value === "number" &&
    (SALES_CLOSE_BEFORE_END_MINUTES as readonly number[]).includes(value)
  );
}

/**
 * The setting from what a form or a request sent: `undefined` when nothing
 * was sent (an edit then keeps the event's setting), the setting when it is
 * one, or `"invalid"` (a number that isn't on the list, or not a number).
 */
export function parseSalesClose(
  value: unknown,
): SalesClose | undefined | "invalid" {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return isSalesCloseBeforeEndMinutes(value) ? value : "invalid";
}

/**
 * The setting stored on an event row. A row from before the setting existed,
 * or a value that isn't on the list, reads as the default (sales close at
 * the start), which is how those events always behaved.
 */
export function salesCloseOf(event: {
  sales_close_before_end_minutes?: number | null;
}): SalesClose {
  const value = event.sales_close_before_end_minutes;
  return isSalesCloseBeforeEndMinutes(value) ? value : DEFAULT_SALES_CLOSE;
}

/** The value a form's single select holds for a setting. */
export function salesCloseChoice(setting: SalesClose): string {
  return setting === null ? "at_start" : `before_end:${setting}`;
}

/** Every choice a form offers, the default first. */
export const SALES_CLOSE_CHOICES: readonly SalesClose[] = [
  DEFAULT_SALES_CLOSE,
  ...SALES_CLOSE_BEFORE_END_MINUTES,
];

/** The setting a form's single select stands for, or "invalid". */
export function salesCloseFromChoice(choice: string): SalesClose | "invalid" {
  if (choice === "at_start") return null;
  const [kind, minutes] = choice.split(":");
  if (kind !== "before_end" || !minutes) return "invalid";
  const parsed = parseSalesClose(Number(minutes));
  return parsed === undefined ? "invalid" : parsed;
}

/**
 * The setting a request carries for a form's choice. The forms only offer
 * the list, so a choice that isn't one (an old draft) reads as the default.
 */
export function salesCloseRequestValue(
  choice: string | null | undefined,
): SalesClose {
  if (!choice) return DEFAULT_SALES_CLOSE;
  const setting = salesCloseFromChoice(choice);
  return setting === "invalid" ? DEFAULT_SALES_CLOSE : setting;
}

/** How a form or a page names a setting, before any words are attached. */
export type SalesCloseLabel =
  | { kind: "at_start" }
  | { kind: "until_end" }
  | { kind: "minutes_before_end"; minutes: number }
  | { kind: "hours_before_end"; hours: number };

export function salesCloseLabel(setting: SalesClose): SalesCloseLabel {
  if (setting === null) return { kind: "at_start" };
  if (setting === 0) return { kind: "until_end" };
  return setting % 60 === 0
    ? { kind: "hours_before_end", hours: setting / 60 }
    : { kind: "minutes_before_end", minutes: setting };
}

/**
 * When sales close for a session that is on, as the event page says it
 * ("On now — tickets on sale until 18:00"): the time on the event's clock,
 * and the day too when that is not today there (a festival day that runs
 * past midnight, a session over several days).
 */
export function salesCloseClock(
  closesAt: Date,
  timeZone: string | null | undefined,
  locale: string | null | undefined,
  now: number = Date.now(),
): { time: string; day: string | null } {
  const close = formatSingleDateTime(closesAt, timeZone, locale);
  const today = formatSingleDateTime(new Date(now), timeZone, locale);
  return {
    time: close.time,
    day: close.date === today.date ? null : close.date,
  };
}

const MINUTE_MS = 60 * 1000;

function closesAtMs(starts: number, ends: number, setting: SalesClose): number {
  if (setting === null) return starts;
  return Math.max(starts, ends - setting * MINUTE_MS);
}

/**
 * The instant online sales close for one session: its start, or — when the
 * organizer keeps selling while it's on — `minutes` before its end (never
 * before its start). Null when the start doesn't parse; a session with no
 * readable end closes at its start. The SQL twin is
 * public.event_session_sales_close_at.
 */
export function sessionSalesCloseAt(
  session: { starts_at: string | Date; ends_at: string | Date },
  setting: number | null | undefined,
): Date | null {
  const starts = new Date(session.starts_at).getTime();
  if (Number.isNaN(starts)) return null;
  const ends = new Date(session.ends_at).getTime();
  const normalized = isSalesCloseBeforeEndMinutes(setting) ? setting : null;
  if (Number.isNaN(ends)) return new Date(starts);
  return new Date(closesAtMs(starts, ends, normalized));
}

/** Whether a ticket for this one session can be sold at `now`. */
export function isSessionOnSale(
  session: { starts_at: string | Date; ends_at: string | Date },
  setting: number | null | undefined,
  now: number = Date.now(),
): boolean {
  const closes = sessionSalesCloseAt(session, setting);
  return closes !== null && now < closes.getTime();
}

/**
 * What the sales window is evaluated against: the clock, and the event's
 * sales-close setting (omitted = the default, sales close at the start).
 */
export type SalesWindowOptions = {
  now?: number;
  salesCloseBeforeEndMinutes?: number | null;
};

function readOptions(nowOrOptions: number | SalesWindowOptions | undefined): {
  now: number;
  setting: SalesClose;
} {
  if (typeof nowOrOptions === "number") {
    return { now: nowOrOptions, setting: DEFAULT_SALES_CLOSE };
  }
  const setting = nowOrOptions?.salesCloseBeforeEndMinutes;
  return {
    now: nowOrOptions?.now ?? Date.now(),
    setting: isSalesCloseBeforeEndMinutes(setting)
      ? setting
      : DEFAULT_SALES_CLOSE,
  };
}

export type PurchaseBlockReason = "no_dates" | "ended" | "ongoing_no_future";

export type OccurrenceState<T extends OccurrenceLike = OccurrenceLike> = {
  /** Same value getEventStatus() returns for the same schedule. */
  status: EventStatus | null;
  /** Sessions whose end time is at or before `now`, latest first. */
  past: T[];
  /** The session in progress right now (start reached, end not), if any. */
  current: T | null;
  /** Sessions that have not started yet, earliest first. */
  future: T[];
  /**
   * The occurrence a new purchase should attach to: the session in progress
   * when the organizer keeps selling while it's on and its sales are still
   * open, else the earliest session that has not started. `null` when
   * nothing is on sale.
   */
  nextPurchasable: T | null;
  /** When online sales close for `nextPurchasable`, or null. */
  salesCloseAt: Date | null;
  /**
   * True when `nextPurchasable` is a session already in progress ("On now —
   * tickets on sale until 18:00").
   */
  onNow: boolean;
  /** True iff a ticket can be sold for at least one session now. */
  purchasable: boolean;
  /** Why purchasing is blocked, or `null` when `purchasable` is true. */
  blockReason: PurchaseBlockReason | null;
};

function normalize<T extends OccurrenceLike>(
  occurrences: readonly T[],
  setting: SalesClose,
): NormalizedOccurrence<T>[] {
  return occurrences
    .map((occ) => {
      const starts = new Date(occ.starts_at).getTime();
      const ends = new Date(occ.ends_at).getTime();
      return {
        source: occ,
        starts,
        ends,
        closes: closesAtMs(starts, ends, setting),
      };
    })
    .filter((occ) => !Number.isNaN(occ.starts) && !Number.isNaN(occ.ends));
}

/**
 * Builds the session list to evaluate: a multi-date event's real
 * `event_occurrence` rows, or — for a single-date event, which has none —
 * one pseudo-session from the event's own `starts_at`/`ends_at`. Mirrors
 * eventStatus.ts's own normalisation so both helpers see the same windows.
 *
 * The fourth argument is the clock (a number, for the default sales rule)
 * or `{ now?, salesCloseBeforeEndMinutes? }` — pass the event's
 * `sales_close_before_end_minutes` everywhere a sale is decided or offered.
 */
export function resolveOccurrenceState<T extends OccurrenceLike>(
  starts_at: string | Date | null | undefined,
  ends_at: string | Date | null | undefined,
  occurrences?: readonly T[] | null,
  nowOrOptions?: number | SalesWindowOptions,
): OccurrenceState<T> {
  const { now, setting } = readOptions(nowOrOptions);
  const source: readonly (T | OccurrenceLike)[] =
    occurrences && occurrences.length > 0
      ? occurrences
      : starts_at && ends_at
        ? [{ starts_at, ends_at }]
        : [];

  const normalized = normalize(source as readonly T[], setting);

  if (normalized.length === 0) {
    return {
      status: null,
      past: [],
      current: null,
      future: [],
      nextPurchasable: null,
      salesCloseAt: null,
      onNow: false,
      purchasable: false,
      blockReason: "no_dates",
    };
  }

  const past: NormalizedOccurrence<T>[] = [];
  const ongoing: NormalizedOccurrence<T>[] = [];
  const future: NormalizedOccurrence<T>[] = [];

  for (const occ of normalized) {
    if (now >= occ.ends) {
      // End time reached — the session is over. (Exactly at end time counts
      // as ended, matching getEventStatus's `now <= ends` for "ongoing".)
      past.push(occ);
    } else if (now >= occ.starts) {
      // Start time reached, end not — in progress. Exactly at the start
      // instant already counts as ongoing.
      ongoing.push(occ);
    } else {
      future.push(occ);
    }
  }

  past.sort((a, b) => b.starts - a.starts);
  future.sort((a, b) => a.starts - b.starts);
  ongoing.sort((a, b) => a.starts - b.starts);

  // A session in progress is still sold only while its sales are open
  // (never with the default setting: it closes at the start). It comes
  // before any later session: it's the one people can go to now.
  const onSale = [...ongoing.filter((occ) => now < occ.closes), ...future];
  const next = onSale[0] ?? null;
  const purchasable = next !== null;

  let status: EventStatus;
  if (ongoing.length > 0) status = "ongoing";
  else if (future.length > 0) status = "upcoming";
  else status = "ended";

  let blockReason: PurchaseBlockReason | null = null;
  if (!purchasable) {
    blockReason = ongoing.length > 0 ? "ongoing_no_future" : "ended";
  }

  return {
    status,
    past: past.map((o) => o.source),
    current: ongoing[0]?.source ?? null,
    future: future.map((o) => o.source),
    nextPurchasable: next?.source ?? null,
    salesCloseAt: next ? new Date(next.closes) : null,
    onNow: next !== null && now >= next.starts,
    purchasable,
    blockReason,
  };
}

/**
 * Narrow guard for a client-supplied occurrence id: it must belong to the
 * event's real occurrences AND still be on sale (not started, or — when the
 * organizer keeps selling while it's on — before its cut-off). Used by the
 * checkout/RSVP services before a purchase is allowed to reference it.
 * Returns the matched occurrence, or a reason it was rejected.
 */
export function validatePurchaseOccurrence<T extends OccurrenceLike>(
  occurrenceId: string,
  occurrences: readonly T[] | null | undefined,
  nowOrOptions?: number | SalesWindowOptions,
): { ok: true; occurrence: T } | { ok: false; reason: "unknown" | "started" } {
  const { now, setting } = readOptions(nowOrOptions);
  const match = (occurrences ?? []).find((occ) => occ.id === occurrenceId);

  if (!match) return { ok: false, reason: "unknown" };

  if (!isSessionOnSale(match, setting, now)) {
    return { ok: false, reason: "started" };
  }

  return { ok: true, occurrence: match };
}

// Re-exported so callers can keep a single import for the date-rule helpers.
export type { Occurrence };
