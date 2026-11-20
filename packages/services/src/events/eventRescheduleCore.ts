// Moving an event that already has tickets (docs/architecture/event-reschedule.md).
// Shared by the web actions (rescheduleEvent, getRescheduleSetup,
// getEventReschedule, keepTicketsAfterReschedule, refundAfterReschedule) and
// their /api/mobile twins.
//
// The organizer moves a published event that has not started (or a
// postponed one) with a message: to a new date, a new venue in the same
// country, or both; one date of an event with several dates; or postpones a
// single-date event with no new date yet. event_reschedule() (service role)
// moves it, its tickets' validity and running Pay small small plans, records
// the move and writes one notice per holder (pushed). The web transport then
// emails every holder. Each holder keeps their tickets (nothing to do) or,
// until the refund window closes (while postponed: until the new date is
// set), gives them back for the ticket price and the service fee whatever
// the event's refund policy says (cancelEventTicketsCore with
// afterReschedule; for one date, only that date's tickets).

import {
  MAX_POSTPONEMENTS,
  MAX_RESCHEDULES,
  type RescheduleProblem,
  rescheduleMessageProblem,
  rescheduleProblem,
  rescheduleRefundOpen,
} from "@abonten/core/eventReschedule";
import { readStructuredAddress } from "@abonten/core/geo/address";
import { logger } from "@abonten/core/logger";
import { parseEventTimestamp } from "@abonten/core/time/timeZone";
import { userFacingError } from "@abonten/core/userFacingError";
import type { Database } from "@abonten/types/database.types";
import type { EventCancelQuote } from "@abonten/types/ticketType";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tr } from "../i18n/requestLocale";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import {
  cancelEventTicketsCore,
  eventCancelQuoteCore,
} from "../tickets/cancelEventTicketsCore";
import {
  type EventVenueArgs,
  type EventVenueInput,
  resolveEventVenue,
} from "./resolveEventVenue";

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

const PROBLEM_KEYS: Record<RescheduleProblem, string> = {
  dates: "rescheduleProblemDates",
  too_soon: "rescheduleProblemTooSoon",
  unchanged: "rescheduleProblemUnchanged",
  message: "rescheduleProblemMessage",
  too_many: "rescheduleProblemTooMany",
};

// ---------------------------------------------------------------------------
// Organizer

/** One date of an event with several dates, as the move form lists it. */
export type RescheduleDate = {
  id: string;
  startsAt: string;
  endsAt: string;
  /** Times this date has moved. */
  moves: number;
};

export type RescheduleSetup = {
  /** Why nothing can be moved, or null. */
  blocked: "not_published" | "started" | "too_many" | null;
  /** Times the event moved as a whole. */
  moves: number;
  maxMoves: number;
  /** People holding a ticket now (each gets the notice). */
  holders: number;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  /** Postponed and waiting for its new date (since when). */
  postponedAt: string | null;
  /** "Postponed, new date to come" is available. */
  canPostpone: boolean;
  /** A seating plan: the venue can't change. */
  seated: boolean;
  /** The current venue, as people read it. */
  venue: string | null;
  /** An event with several dates: those still to come. */
  dates: RescheduleDate[];
};

export type RescheduleSetupResult =
  | { status: 200; data: RescheduleSetup }
  | { status: 404 | 500; message: string };

type OwnedEvent = {
  id: string;
  title: string;
  status: string | null;
  timezone: string | null;
  country_code: string;
  starts_at: string | null;
  ends_at: string | null;
  postponed_at: string | null;
  address: unknown;
  place: { name: string } | null;
  event_occurrence: { id: string; starts_at: string; ends_at: string }[] | null;
};

async function readOwnedEvent(
  supabase: SupabaseClient<Database>,
  accountId: string,
  eventId: string,
): Promise<{ event: OwnedEvent | null; error: boolean }> {
  // The caller's own client: only the organizer side reads it here.
  const { data, error } = await supabase
    .from("event")
    .select(
      "id, title, status, timezone, country_code, starts_at, ends_at, postponed_at, address, place:place_id(name), event_occurrence(id, starts_at, ends_at)",
    )
    .eq("id", eventId)
    .eq("organizer_id", accountId)
    .maybeSingle();
  if (error) {
    logger.error(`reschedule: event read failed (${error.message})`);
    return { event: null, error: true };
  }
  return {
    event: (data as unknown as OwnedEvent | null) ?? null,
    error: false,
  };
}

function venueLabel(event: OwnedEvent): string | null {
  return (
    event.place?.name ??
    (readStructuredAddress(event.address).full_address || null)
  );
}

type MoveCount = { occurrence_id: string | null; kind: string };

async function moveCounts(eventId: string): Promise<MoveCount[]> {
  const { data } = await getSupabaseServiceClient()
    .from("event_reschedule")
    .select("occurrence_id, kind")
    .eq("event_id", eventId);
  return (data ?? []) as MoveCount[];
}

/** What the organizer's "Move the event" form needs to know. */
export async function getRescheduleSetupCore(
  supabase: SupabaseClient<Database>,
  accountId: string,
  eventId: string,
): Promise<RescheduleSetupResult> {
  const { event, error } = await readOwnedEvent(supabase, accountId, eventId);
  if (error) return { status: 500, message: tr("somethingWentWrong") };
  if (!event)
    return { status: 404, message: tr("eventNotFoundOrUnauthorized") };

  const service = getSupabaseServiceClient();
  const [counts, holders, { count: seating }] = await Promise.all([
    moveCounts(eventId),
    holderCount(eventId),
    service
      .from("event_seating")
      .select("event_id", { count: "exact", head: true })
      .eq("event_id", eventId),
  ]);
  const now = Date.now();
  const occurrences = event.event_occurrence ?? [];
  const wholeMoves = counts.filter(
    (c) => c.kind === "move" && !c.occurrence_id,
  ).length;
  const postponements = counts.filter((c) => c.kind === "postpone").length;
  const dates: RescheduleDate[] = occurrences
    .filter((o) => new Date(o.starts_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((o) => ({
      id: o.id,
      startsAt: o.starts_at,
      endsAt: o.ends_at,
      moves: counts.filter((c) => c.kind === "move" && c.occurrence_id === o.id)
        .length,
    }));
  const severalDates = occurrences.length > 0;
  const started = severalDates
    ? dates.length === 0
    : !event.postponed_at &&
      (!event.starts_at || new Date(event.starts_at).getTime() <= now);
  const canPostpone =
    !severalDates &&
    !started &&
    !event.postponed_at &&
    postponements < MAX_POSTPONEMENTS;
  const blocked: RescheduleSetup["blocked"] =
    event.status !== "published"
      ? "not_published"
      : started
        ? "started"
        : !severalDates && wholeMoves >= MAX_RESCHEDULES && !canPostpone
          ? "too_many"
          : null;
  return {
    status: 200,
    data: {
      blocked,
      moves: wholeMoves,
      maxMoves: MAX_RESCHEDULES,
      holders,
      title: event.title,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      timezone: event.timezone ?? "Africa/Accra",
      postponedAt: event.postponed_at,
      canPostpone,
      seated: (seating ?? 0) > 0,
      venue: venueLabel(event),
      dates,
    },
  };
}

async function holderCount(eventId: string): Promise<number> {
  const { data, error } = await getSupabaseServiceClient()
    .from("ticket")
    .select("user_id, ticket_type:ticket_type_id!inner(event_id)")
    .eq("ticket_type.event_id", eventId)
    .eq("status", "active");
  if (error) {
    logger.error(`reschedule: holder count failed (${error.message})`);
    return 0;
  }
  return new Set((data ?? []).map((t) => t.user_id)).size;
}

export type RescheduleEventInput = {
  eventId: string;
  /** "Postponed, new date to come" (single-date events). */
  postpone?: boolean;
  /** One date of an event with several dates. */
  occurrenceId?: string | null;
  /** The new date: instants, or wall-clock times in the venue's zone. */
  startsAt?: string | null;
  endsAt?: string | null;
  /** A new venue in the same country. */
  venue?: EventVenueInput | null;
  message: string;
};

export type RescheduleEventResult =
  | {
      status: 200;
      message: string;
      data: {
        rescheduleId: string;
        holders: number;
        /** Null while postponed: holders may give tickets back until the new date. */
        refundUntil: string | null;
      };
    }
  | { status: 400 | 403 | 404 | 409 | 500; message: string };

/** Moves or postpones the event; the transport then emails the holders. */
export async function rescheduleEventCore(
  supabase: SupabaseClient<Database>,
  accountId: string,
  actorId: string,
  input: RescheduleEventInput,
): Promise<RescheduleEventResult> {
  if (await isAccountRestricted(accountId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const { event, error } = await readOwnedEvent(
    supabase,
    accountId,
    input.eventId,
  );
  if (error) return { status: 500, message: tr("somethingWentWrong") };
  if (!event)
    return { status: 404, message: tr("eventNotFoundOrUnauthorized") };
  if (rescheduleMessageProblem(input.message)) {
    return { status: 400, message: tr(PROBLEM_KEYS.message) };
  }

  const hasDate = !!(input.startsAt || input.endsAt);
  let venueArgs: EventVenueArgs = {};
  let zone = event.timezone ?? "Africa/Accra";
  let startsAt: Date | null = null;
  let endsAt: Date | null = null;

  if (!input.postpone) {
    if (input.venue) {
      const venue = await resolveEventVenue(
        input.venue,
        event.country_code,
        tr("anEventCanTMoveTo"),
      );
      if (!venue.ok) return { status: venue.status, message: venue.message };
      // A new venue's clock reads the new times.
      zone = venue.timeZone || zone;
      venueArgs = venue.args;
    }
    if (!hasDate && !input.venue) {
      return { status: 400, message: tr(PROBLEM_KEYS.dates) };
    }
    if (hasDate) {
      startsAt = parseEventTimestamp(input.startsAt ?? "", zone);
      endsAt = parseEventTimestamp(input.endsAt ?? "", zone);
      const occurrence = input.occurrenceId
        ? (event.event_occurrence ?? []).find(
            (o) => o.id === input.occurrenceId,
          )
        : null;
      if (input.occurrenceId && !occurrence) {
        return { status: 404, message: tr("rescheduleDateNotFound") };
      }
      const counts = await moveCounts(event.id);
      const problem = rescheduleProblem({
        startsAt,
        endsAt,
        message: input.message,
        currentStartsAt: occurrence
          ? new Date(occurrence.starts_at)
          : event.starts_at
            ? new Date(event.starts_at)
            : null,
        currentEndsAt: occurrence
          ? new Date(occurrence.ends_at)
          : event.ends_at
            ? new Date(event.ends_at)
            : null,
        moves: counts.filter(
          (c) =>
            c.kind === "move" &&
            (c.occurrence_id ?? null) === (input.occurrenceId ?? null),
        ).length,
        sameDateAllowed: !!input.venue || !!event.postponed_at,
      });
      if (problem) {
        return {
          status: problem === "too_many" || problem === "unchanged" ? 409 : 400,
          message: tr(PROBLEM_KEYS[problem]),
        };
      }
    }
  }

  const { data, error: rpcError } = await getSupabaseServiceClient().rpc(
    "event_reschedule",
    {
      p_event_id: event.id,
      p_actor: actorId,
      // PostgREST drops undefined keys: every optional argument is sent.
      p_starts_at: startsAt ? startsAt.toISOString() : (null as never),
      p_ends_at: endsAt ? endsAt.toISOString() : (null as never),
      p_message: input.message.trim(),
      p_occurrence_id: input.occurrenceId ?? (null as never),
      p_postpone: !!input.postpone,
      ...venueArgs,
    },
  );
  if (rpcError) {
    if (
      rpcError.code === CHECK_VIOLATION ||
      rpcError.code === UNIQUE_VIOLATION
    ) {
      return {
        status: 409,
        message: userFacingError(
          `reschedule: refused for ${event.id}`,
          rpcError,
        ),
      };
    }
    logger.error(`reschedule: ${event.id} failed (${rpcError.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { status: 500, message: tr("somethingWentWrong") };
  return {
    status: 200,
    message: input.postpone
      ? tr("eventPostponedNotified", { count: row.holders })
      : tr("eventMovedNotified", { count: row.holders }),
    data: {
      rescheduleId: row.reschedule_id,
      holders: row.holders,
      refundUntil: row.refund_until ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Holders

export type HolderReschedule = {
  rescheduleId: string;
  eventId: string;
  title: string;
  kind: "move" | "postpone";
  /** The date of several that moved; null when the whole event moved. */
  occurrenceId: string | null;
  previousStartsAt: string;
  /** Null while postponed. */
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  /** The new venue, when it changed. */
  venue: string | null;
  previousVenue: string | null;
  /** The event is postponed now (no new date yet). */
  postponed: boolean;
  message: string;
  /** Null while postponed (open until the new date is set). */
  refundUntil: string | null;
  /** Giving tickets back is open and the event still on. */
  refundOpen: boolean;
  choice: "keep" | "refund" | null;
  /** Tickets the person holds for the event (for one date: that date) now. */
  activeTickets: number;
  /** What giving them back returns now (null when it can't be priced). */
  refund: EventCancelQuote["refund"];
  /** Why they can't give them back here (sent to them, paid together…). */
  refundBlocked: string | null;
};

export type HolderRescheduleResult =
  | { status: 200; data: HolderReschedule | null }
  | { status: 500; message: string };

type RescheduleRow = {
  id: string;
  event_id: string;
  kind: "move" | "postpone";
  occurrence_id: string | null;
  previous_starts_at: string;
  starts_at: string | null;
  ends_at: string | null;
  message: string;
  refund_until: string | null;
  venue_moved: boolean;
  address: unknown;
  previous_address: unknown;
  place: { name: string } | null;
  previous_place: { name: string } | null;
};

const ROW_COLUMNS =
  "id, event_id, kind, occurrence_id, previous_starts_at, starts_at, ends_at, message, refund_until, venue_moved, address, previous_address, place:place_id(name), previous_place:previous_place_id(name)";

function rowVenue(
  place: { name: string } | null,
  address: unknown,
): string | null {
  return place?.name ?? (readStructuredAddress(address).full_address || null);
}

/**
 * The move a person's tickets follow: the latest that moved the whole event
 * or a date they hold. With no ticket left, the latest they answered.
 */
async function relevantReschedule(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<{
  row: RescheduleRow | null;
  activeTickets: number;
  error: boolean;
}> {
  const service = getSupabaseServiceClient();
  const [{ data: rows, error }, { data: tickets }] = await Promise.all([
    service
      .from("event_reschedule")
      .select(ROW_COLUMNS)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("ticket")
      .select("id, occurrence_id, ticket_type:ticket_type_id!inner(event_id)")
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("ticket_type.event_id", eventId),
  ]);
  if (error) {
    logger.error(`reschedule: read failed (${error.message})`);
    return { row: null, activeTickets: 0, error: true };
  }
  const moves = (rows ?? []) as unknown as RescheduleRow[];
  if (moves.length === 0) return { row: null, activeTickets: 0, error: false };
  const held = (tickets ?? []) as { occurrence_id: string | null }[];
  const dates = new Set(held.map((t) => t.occurrence_id));
  const row =
    moves.find((m) => !m.occurrence_id || dates.has(m.occurrence_id)) ?? null;
  if (row && held.length > 0) {
    const activeTickets = row.occurrence_id
      ? held.filter((t) => t.occurrence_id === row.occurrence_id).length
      : held.length;
    return { row, activeTickets, error: false };
  }
  // Nothing held any more: the latest move they answered, if any.
  const { data: choices } = await service
    .from("event_reschedule_choice")
    .select("reschedule_id")
    .eq("user_id", userId)
    .in(
      "reschedule_id",
      moves.map((m) => m.id),
    );
  const answered = new Set((choices ?? []).map((c) => c.reschedule_id));
  return {
    row: moves.find((m) => answered.has(m.id)) ?? null,
    activeTickets: 0,
    error: false,
  };
}

function refundIsOpen(
  row: RescheduleRow,
  event: { status: string | null; postponed_at: string | null },
): boolean {
  if (event.status !== "published") return false;
  if (row.kind === "postpone") return !!event.postponed_at;
  return !!row.refund_until && rescheduleRefundOpen(row.refund_until);
}

/**
 * The move an event's holder sees on their ticket, or null when it never
 * moved (or the person holds nothing it touched and never answered).
 */
export async function getEventRescheduleForHolderCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<HolderRescheduleResult> {
  const { row, activeTickets, error } = await relevantReschedule(
    supabase,
    userId,
    eventId,
  );
  if (error) return { status: 500, message: tr("somethingWentWrong") };
  if (!row) return { status: 200, data: null };

  const service = getSupabaseServiceClient();
  const [{ data: event }, { data: choice }] = await Promise.all([
    service
      .from("event")
      .select("title, status, timezone, postponed_at")
      .eq("id", eventId)
      .maybeSingle(),
    service
      .from("event_reschedule_choice")
      .select("choice")
      .eq("reschedule_id", row.id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!event) return { status: 200, data: null };

  const refundOpen = refundIsOpen(row, event);
  let refund: EventCancelQuote["refund"] = null;
  let refundBlocked: string | null = null;
  if (refundOpen && activeTickets > 0) {
    const quote = await eventCancelQuoteCore(supabase, userId, eventId, {
      afterReschedule: true,
      occurrenceId: row.occurrence_id,
    });
    if (quote.status === 200) {
      refund = quote.data.refund;
      if (quote.data.blocked === "other_events") {
        refundBlocked = tr("someOfTheseTicketsWerePaidTogether");
      } else if (quote.data.blocked === "checked_in") {
        refundBlocked = tr("aTicketFromThisPaymentWasChecked");
      }
    } else if (quote.status === 409) {
      refundBlocked = quote.message;
    }
  }

  return {
    status: 200,
    data: {
      rescheduleId: row.id,
      eventId,
      title: event.title,
      kind: row.kind,
      occurrenceId: row.occurrence_id,
      previousStartsAt: row.previous_starts_at,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: event.timezone ?? "Africa/Accra",
      venue: row.venue_moved ? rowVenue(row.place, row.address) : null,
      previousVenue: row.venue_moved
        ? rowVenue(row.previous_place, row.previous_address)
        : null,
      postponed: !!event.postponed_at,
      message: row.message,
      refundUntil: row.refund_until,
      refundOpen,
      choice: (choice?.choice as "keep" | "refund" | undefined) ?? null,
      activeTickets,
      refund,
      refundBlocked,
    },
  };
}

async function recordChoice(
  rescheduleId: string,
  userId: string,
  choice: "keep" | "refund",
): Promise<boolean> {
  const { error } = await getSupabaseServiceClient()
    .from("event_reschedule_choice")
    .upsert(
      {
        reschedule_id: rescheduleId,
        user_id: userId,
        choice,
        decided_at: new Date().toISOString(),
      },
      { onConflict: "reschedule_id,user_id" },
    );
  if (error) {
    logger.error(`reschedule: choice not recorded (${error.message})`);
    return false;
  }
  return true;
}

export type RescheduleChoiceResult = { status: number; message: string };

/** "Keep my tickets": nothing changes; the prompt goes away. */
export async function keepTicketsAfterRescheduleCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<RescheduleChoiceResult> {
  const { row, activeTickets, error } = await relevantReschedule(
    supabase,
    userId,
    eventId,
  );
  if (error) return { status: 500, message: tr("somethingWentWrong") };
  if (!row) return { status: 404, message: tr("rescheduleNotFound") };
  if (!activeTickets)
    return { status: 404, message: tr("noActiveTicketsForThisEvent") };
  if (!(await recordChoice(row.id, userId, "keep"))) {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  return { status: 200, message: tr("rescheduleKept") };
}

/**
 * "Get a refund": gives back every ticket the person holds for the event
 * (for a date that moved: that date's) and paid for themselves (and their
 * free ones), for the ticket price and the service fee, while the window is
 * open.
 */
export async function refundAfterRescheduleCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<RescheduleChoiceResult> {
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const { row, error } = await relevantReschedule(supabase, userId, eventId);
  if (error) return { status: 500, message: tr("somethingWentWrong") };
  if (!row) return { status: 404, message: tr("rescheduleNotFound") };
  const { data: event } = await getSupabaseServiceClient()
    .from("event")
    .select("status, postponed_at")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || !refundIsOpen(row, event)) {
    return { status: 409, message: tr("rescheduleRefundClosed") };
  }

  const result = await cancelEventTicketsCore(supabase, userId, eventId, {
    afterReschedule: true,
    occurrenceId: row.occurrence_id,
  });
  if (result.status === 200) await recordChoice(row.id, userId, "refund");
  return { status: result.status, message: result.message };
}

// ---------------------------------------------------------------------------
// Email

export type RescheduleEmailBatch = {
  eventId: string;
  title: string;
  kind: "move" | "postpone";
  /** A date of several moved (its old start is previousStartsAt). */
  oneDate: boolean;
  previousStartsAt: string;
  /** Null for a postponement. */
  startsAt: string | null;
  timezone: string;
  /** The new and the old venue, when it changed. */
  venue: string | null;
  previousVenue: string | null;
  /** The date changed too (not only the venue). */
  dateChanged: boolean;
  message: string;
  /** Null for a postponement (open until the new date is set). */
  refundUntil: string | null;
  userIds: string[];
};

/** Who gets the "your event moved" email: every person the move told. */
export async function rescheduleEmailBatchCore(
  rescheduleId: string,
): Promise<RescheduleEmailBatch | null> {
  const service = getSupabaseServiceClient();
  const { data, error } = await service
    .from("event_reschedule")
    .select(`${ROW_COLUMNS}, event:event_id(title, timezone)`)
    .eq("id", rescheduleId)
    .maybeSingle();
  if (error || !data) {
    logger.error(
      `reschedule: email batch read failed (${error?.message ?? "missing"})`,
    );
    return null;
  }
  const row = data as unknown as RescheduleRow & {
    event: { title: string; timezone: string | null } | null;
  };
  const { data: notices } = await service
    .from("notification")
    .select("user_id")
    .eq("type", "event_rescheduled")
    .eq("data->>rescheduleId", rescheduleId);
  return {
    eventId: row.event_id,
    title: row.event?.title ?? "",
    kind: row.kind,
    oneDate: !!row.occurrence_id,
    previousStartsAt: row.previous_starts_at,
    startsAt: row.starts_at,
    timezone: row.event?.timezone ?? "Africa/Accra",
    venue: row.venue_moved ? rowVenue(row.place, row.address) : null,
    previousVenue: row.venue_moved
      ? rowVenue(row.previous_place, row.previous_address)
      : null,
    dateChanged:
      row.kind === "move" &&
      !!row.starts_at &&
      row.starts_at !== row.previous_starts_at,
    message: row.message,
    refundUntil: row.refund_until,
    userIds: Array.from(new Set((notices ?? []).map((n) => n.user_id))),
  };
}
