// Moving an event that already has tickets (docs/architecture/event-reschedule.md).
// Shared by the web actions (rescheduleEvent, getRescheduleSetup,
// getEventReschedule, keepTicketsAfterReschedule, refundAfterReschedule) and
// their /api/mobile twins.
//
// The organizer moves a published single-date event that has not started to
// a new date with a message; event_reschedule() (service role) moves it, its
// tickets' validity and running Pay small small plans, records the move and
// writes one notice per holder (pushed). The web transport then emails every
// holder. Each holder keeps their tickets (nothing to do) or, until the
// refund window closes, gives them back for the ticket price and the service
// fee whatever the event's refund policy says (cancelEventTicketsCore with
// afterReschedule).

import {
  MAX_RESCHEDULES,
  type RescheduleProblem,
  rescheduleProblem,
  rescheduleRefundOpen,
} from "@abonten/core/eventReschedule";
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

export type RescheduleSetup = {
  /** Why it can't be moved, or null. */
  blocked: "not_published" | "several_dates" | "started" | "too_many" | null;
  moves: number;
  maxMoves: number;
  /** People holding a ticket now (each gets the notice). */
  holders: number;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
};

export type RescheduleSetupResult =
  | { status: 200; data: RescheduleSetup }
  | { status: 404 | 500; message: string };

type OwnedEvent = {
  id: string;
  title: string;
  status: string | null;
  timezone: string | null;
  starts_at: string | null;
  ends_at: string | null;
  event_occurrence: { id: string }[] | null;
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
      "id, title, status, timezone, starts_at, ends_at, event_occurrence(id)",
    )
    .eq("id", eventId)
    .eq("organizer_id", accountId)
    .maybeSingle();
  if (error) {
    logger.error(`reschedule: event read failed (${error.message})`);
    return { event: null, error: true };
  }
  return { event: (data as OwnedEvent | null) ?? null, error: false };
}

/** What the organizer's "Move to a new date" form needs to know. */
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
  const [{ count: moves }, holders] = await Promise.all([
    service
      .from("event_reschedule")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId),
    holderCount(eventId),
  ]);
  const started =
    !event.starts_at || new Date(event.starts_at).getTime() <= Date.now();
  const blocked: RescheduleSetup["blocked"] =
    event.status !== "published"
      ? "not_published"
      : (event.event_occurrence ?? []).length > 0
        ? "several_dates"
        : started
          ? "started"
          : (moves ?? 0) >= MAX_RESCHEDULES
            ? "too_many"
            : null;
  return {
    status: 200,
    data: {
      blocked,
      moves: moves ?? 0,
      maxMoves: MAX_RESCHEDULES,
      holders,
      title: event.title,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      timezone: event.timezone ?? "Africa/Accra",
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
  /** Instants, or wall-clock times in the event's zone. */
  startsAt: string;
  endsAt: string;
  message: string;
};

export type RescheduleEventResult =
  | {
      status: 200;
      message: string;
      data: { rescheduleId: string; holders: number; refundUntil: string };
    }
  | { status: 400 | 403 | 404 | 409 | 500; message: string };

/** Moves the event; the transport then emails the holders. */
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
  if (!event.starts_at) {
    return { status: 409, message: tr("rescheduleSeveralDates") };
  }

  const zone = event.timezone ?? "Africa/Accra";
  const startsAt = parseEventTimestamp(input.startsAt, zone);
  const endsAt = parseEventTimestamp(input.endsAt, zone);
  const { count: moves } = await getSupabaseServiceClient()
    .from("event_reschedule")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id);
  const problem = rescheduleProblem({
    startsAt,
    endsAt,
    message: input.message,
    currentStartsAt: new Date(event.starts_at),
    currentEndsAt: event.ends_at ? new Date(event.ends_at) : null,
    moves: moves ?? 0,
  });
  if (problem) {
    return {
      status: problem === "too_many" || problem === "unchanged" ? 409 : 400,
      message: tr(PROBLEM_KEYS[problem]),
    };
  }

  const { data, error: rpcError } = await getSupabaseServiceClient().rpc(
    "event_reschedule",
    {
      p_event_id: event.id,
      p_actor: actorId,
      p_starts_at: (startsAt as Date).toISOString(),
      p_ends_at: (endsAt as Date).toISOString(),
      p_message: input.message.trim(),
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
    message: tr("eventMovedNotified", { count: row.holders }),
    data: {
      rescheduleId: row.reschedule_id,
      holders: row.holders,
      refundUntil: row.refund_until,
    },
  };
}

// ---------------------------------------------------------------------------
// Holders

export type HolderReschedule = {
  rescheduleId: string;
  eventId: string;
  title: string;
  previousStartsAt: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  message: string;
  refundUntil: string;
  /** The window is open and the event still on. */
  refundOpen: boolean;
  choice: "keep" | "refund" | null;
  /** Tickets the person holds for the event now. */
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
  previous_starts_at: string;
  starts_at: string;
  ends_at: string;
  message: string;
  refund_until: string;
};

async function latestReschedule(
  eventId: string,
): Promise<{ row: RescheduleRow | null; error: boolean }> {
  const { data, error } = await getSupabaseServiceClient()
    .from("event_reschedule")
    .select(
      "id, event_id, previous_starts_at, starts_at, ends_at, message, refund_until",
    )
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error(`reschedule: read failed (${error.message})`);
    return { row: null, error: true };
  }
  return { row: (data as RescheduleRow | null) ?? null, error: false };
}

/**
 * The latest move of an event as one of its holders sees it, or null when
 * it never moved (or the person holds nothing for it and never chose).
 */
export async function getEventRescheduleForHolderCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<HolderRescheduleResult> {
  const { row, error } = await latestReschedule(eventId);
  if (error) return { status: 500, message: tr("somethingWentWrong") };
  if (!row) return { status: 200, data: null };

  const service = getSupabaseServiceClient();
  const [{ data: event }, { data: choice }, { data: tickets }] =
    await Promise.all([
      service
        .from("event")
        .select("title, status, timezone")
        .eq("id", eventId)
        .maybeSingle(),
      service
        .from("event_reschedule_choice")
        .select("choice")
        .eq("reschedule_id", row.id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("ticket")
        .select("id, ticket_type:ticket_type_id!inner(event_id)")
        .eq("user_id", userId)
        .eq("status", "active")
        .eq("ticket_type.event_id", eventId),
    ]);
  const activeTickets = (tickets ?? []).length;
  if (!event || (activeTickets === 0 && !choice)) {
    return { status: 200, data: null };
  }

  const refundOpen =
    event.status === "published" && rescheduleRefundOpen(row.refund_until);
  let refund: EventCancelQuote["refund"] = null;
  let refundBlocked: string | null = null;
  if (refundOpen && activeTickets > 0) {
    const quote = await eventCancelQuoteCore(supabase, userId, eventId, {
      afterReschedule: true,
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
      previousStartsAt: row.previous_starts_at,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: event.timezone ?? "Africa/Accra",
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
  const { row, error } = await latestReschedule(eventId);
  if (error) return { status: 500, message: tr("somethingWentWrong") };
  if (!row) return { status: 404, message: tr("rescheduleNotFound") };
  const { count } = await supabase
    .from("ticket")
    .select("id, ticket_type:ticket_type_id!inner(event_id)", {
      count: "exact",
      head: true,
    })
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("ticket_type.event_id", eventId);
  if (!count)
    return { status: 404, message: tr("noActiveTicketsForThisEvent") };
  if (!(await recordChoice(row.id, userId, "keep"))) {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  return { status: 200, message: tr("rescheduleKept") };
}

/**
 * "Get a refund": gives back every ticket the person holds for the event
 * and paid for themselves (and their free ones), for the ticket price and
 * the service fee, while the window is open.
 */
export async function refundAfterRescheduleCore(
  supabase: SupabaseClient<Database>,
  userId: string,
  eventId: string,
): Promise<RescheduleChoiceResult> {
  if (await isAccountRestricted(userId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const { row, error } = await latestReschedule(eventId);
  if (error) return { status: 500, message: tr("somethingWentWrong") };
  if (!row) return { status: 404, message: tr("rescheduleNotFound") };
  const { data: event } = await getSupabaseServiceClient()
    .from("event")
    .select("status")
    .eq("id", eventId)
    .maybeSingle();
  if (
    event?.status !== "published" ||
    !rescheduleRefundOpen(row.refund_until)
  ) {
    return { status: 409, message: tr("rescheduleRefundClosed") };
  }

  const result = await cancelEventTicketsCore(supabase, userId, eventId, {
    afterReschedule: true,
  });
  if (result.status === 200) await recordChoice(row.id, userId, "refund");
  return { status: result.status, message: result.message };
}

// ---------------------------------------------------------------------------
// Email

export type RescheduleEmailBatch = {
  eventId: string;
  title: string;
  previousStartsAt: string;
  startsAt: string;
  timezone: string;
  message: string;
  refundUntil: string;
  userIds: string[];
};

/** Who gets the "your event moved" email: every person holding a ticket. */
export async function rescheduleEmailBatchCore(
  rescheduleId: string,
): Promise<RescheduleEmailBatch | null> {
  const service = getSupabaseServiceClient();
  const { data: row, error } = await service
    .from("event_reschedule")
    .select(
      "event_id, previous_starts_at, starts_at, message, refund_until, event:event_id(title, timezone)",
    )
    .eq("id", rescheduleId)
    .maybeSingle();
  if (error || !row) {
    logger.error(
      `reschedule: email batch read failed (${error?.message ?? "missing"})`,
    );
    return null;
  }
  const { data: notices } = await service
    .from("notification")
    .select("user_id")
    .eq("type", "event_rescheduled")
    .eq("data->>rescheduleId", rescheduleId);
  const event = row.event as { title: string; timezone: string | null } | null;
  return {
    eventId: row.event_id,
    title: event?.title ?? "",
    previousStartsAt: row.previous_starts_at,
    startsAt: row.starts_at,
    timezone: event?.timezone ?? "Africa/Accra",
    message: row.message,
    refundUntil: row.refund_until,
    userIds: Array.from(new Set((notices ?? []).map((n) => n.user_id))),
  };
}
