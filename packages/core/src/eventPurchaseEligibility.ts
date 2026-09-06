import type { Occurrence } from "@abonten/types/occurrenceType";
import type { EventStatus } from "./eventStatus";

// Per-occurrence breakdown of an event's schedule, plus the single
// "can a ticket be sold right now" decision derived from it. This is the
// authoritative shape behind the ticket-purchasing date rules: a ticket may
// only ever be sold against a *strictly future* occurrence, so an event is
// purchasable iff at least one of its sessions has not started yet.
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
};

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
   * The occurrence a new purchase should attach to: the earliest strictly
   * future session. `null` when nothing is on sale.
   */
  nextPurchasable: T | null;
  /** True iff at least one strictly future session exists. */
  purchasable: boolean;
  /** Why purchasing is blocked, or `null` when `purchasable` is true. */
  blockReason: PurchaseBlockReason | null;
};

function normalize<T extends OccurrenceLike>(
  occurrences: readonly T[],
): NormalizedOccurrence<T>[] {
  return occurrences
    .map((occ) => ({
      source: occ,
      starts: new Date(occ.starts_at).getTime(),
      ends: new Date(occ.ends_at).getTime(),
    }))
    .filter((occ) => !Number.isNaN(occ.starts) && !Number.isNaN(occ.ends));
}

/**
 * Builds the session list to evaluate: a multi-date event's real
 * `event_occurrence` rows, or — for a single-date event, which has none —
 * one pseudo-session from the event's own `starts_at`/`ends_at`. Mirrors
 * eventStatus.ts's own normalisation so both helpers see the same windows.
 */
export function resolveOccurrenceState<T extends OccurrenceLike>(
  starts_at: string | Date | null | undefined,
  ends_at: string | Date | null | undefined,
  occurrences?: readonly T[] | null,
  now: number = Date.now(),
): OccurrenceState<T> {
  const source: readonly (T | OccurrenceLike)[] =
    occurrences && occurrences.length > 0
      ? occurrences
      : starts_at && ends_at
        ? [{ starts_at, ends_at }]
        : [];

  const normalized = normalize(source as readonly T[]);

  if (normalized.length === 0) {
    return {
      status: null,
      past: [],
      current: null,
      future: [],
      nextPurchasable: null,
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
      // instant already counts as ongoing: a ticket must not be sold for a
      // session that has begun.
      ongoing.push(occ);
    } else {
      future.push(occ);
    }
  }

  past.sort((a, b) => b.starts - a.starts);
  future.sort((a, b) => a.starts - b.starts);
  ongoing.sort((a, b) => a.starts - b.starts);

  const purchasable = future.length > 0;

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
    nextPurchasable: future[0]?.source ?? null,
    purchasable,
    blockReason,
  };
}

/**
 * Narrow guard for a client-supplied occurrence id: it must belong to the
 * event's real occurrences AND be strictly in the future. Used by the
 * checkout/RSVP services before a purchase is allowed to reference it.
 * Returns the matched occurrence, or a reason it was rejected.
 */
export function validatePurchaseOccurrence<T extends OccurrenceLike>(
  occurrenceId: string,
  occurrences: readonly T[] | null | undefined,
  now: number = Date.now(),
): { ok: true; occurrence: T } | { ok: false; reason: "unknown" | "started" } {
  const match = (occurrences ?? []).find((occ) => occ.id === occurrenceId);

  if (!match) return { ok: false, reason: "unknown" };

  if (new Date(match.starts_at).getTime() <= now) {
    return { ok: false, reason: "started" };
  }

  return { ok: true, occurrence: match };
}

// Re-exported so callers can keep a single import for the date-rule helpers.
export type { Occurrence };
