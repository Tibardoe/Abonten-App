// Assigned seats (docs/architecture/assigned-seats.md). An organizer (or a
// team member acting for them, events.manage) describes a venue once as a
// seating plan and gives an event a plan and each ticket type a section.
// Seats are then given by the database when tickets are issued
// (ticket_assign_seat). Every seating table is service-role only, so the
// checks of who may read or change what are here.
//
// An event's seating can change until a seat has been given to one of its
// tickets; saving it seats the tickets already sold for the now-seated
// types and tells their holders (event_seating_set, migration
// 20261124090000).

import { logger } from "@abonten/core/logger";
import { openAmountTypeProblemMessage } from "@abonten/core/openAmountTickets";
import {
  type SeatingPlanInput,
  type SeatingRow,
  seatingPlanProblem,
  seatingProblemMessage,
} from "@abonten/core/seating";
import { userFacingError } from "@abonten/core/userFacingError";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gatePartnerLockRefusal } from "../gatePartners/gatePartnerConfig";
import { coreT, tr } from "../i18n/requestLocale";
import { getSupabaseServiceClient } from "../supabase/serviceClient";

const CHECK_VIOLATION = "23514";

export type SeatingSection = {
  id: string;
  name: string;
  position: number;
  rows: SeatingRow[];
  seatCount: number;
};

export type SeatingPlan = {
  id: string;
  name: string;
  sections: SeatingSection[];
};

export type EventSeatingSetup = {
  plans: SeatingPlan[];
  planId: string | null;
  ticketTypes: {
    id: string;
    type: string | null;
    quantity: number | null;
    admits: number;
    sectionId: string | null;
    /** Tickets issued for this type that hold their place (active or used). */
    sold: number;
  }[];
  /** Seats already given, per section id. */
  seatsGiven: Record<string, number>;
  /** A seat has been given to one of its tickets: its seating no longer changes. */
  locked: boolean;
  /** The event is one show of a run: its seating is its own. */
  inRun: boolean;
};

type Fail = { status: 400 | 403 | 404 | 409 | 500; message: string };

async function ownEvent(
  supabase: SupabaseClient<Database>,
  accountId: string,
  eventId: string,
): Promise<{ id: string; status: string; series_id: string | null } | Fail> {
  const { data, error } = await supabase
    .from("event")
    .select("id, status, series_id")
    .eq("id", eventId)
    .eq("organizer_id", accountId)
    .maybeSingle();
  if (error) {
    logger.error(`seating: event read failed (${error.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!data) return { status: 404, message: tr("eventNotFoundOrUnauthorized") };
  return data;
}

async function plansOf(accountId: string): Promise<SeatingPlan[] | null> {
  const { data, error } = await getSupabaseServiceClient()
    .from("seating_plan")
    .select("id, name, seating_section(id, name, position, rows, seat_count)")
    .eq("owner_id", accountId)
    .order("created_at", { ascending: true });
  if (error) {
    logger.error(`seating: plans read failed (${error.message})`);
    return null;
  }
  return (data ?? []).map((plan) => ({
    id: plan.id,
    name: plan.name,
    sections: [...(plan.seating_section ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        rows: (s.rows as SeatingRow[]) ?? [],
        seatCount: s.seat_count,
      })),
  }));
}

export async function getEventSeatingCore(
  supabase: SupabaseClient<Database>,
  accountId: string,
  eventId: string,
): Promise<{ status: 200; data: EventSeatingSetup } | Fail> {
  const event = await ownEvent(supabase, accountId, eventId);
  if ("status" in event && "message" in event) return event;

  const service = getSupabaseServiceClient();
  const [plans, seating, types] = await Promise.all([
    plansOf(accountId),
    service
      .from("event_seating")
      .select("plan_id")
      .eq("event_id", eventId)
      .maybeSingle(),
    service
      .from("ticket_type")
      .select("id, type, quantity, admits, seating_section_id, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
  ]);
  if (!plans || seating.error || types.error) {
    return { status: 500, message: tr("somethingWentWrong") };
  }

  // Counted, not listed: an event can hold more tickets than one read
  // returns. Seats can only be in the sections of the event's plan.
  const planSections =
    plans.find((p) => p.id === seating.data?.plan_id)?.sections ?? [];
  const [anySeat, given, sold] = await Promise.all([
    // The same rule as event_seating_set: any seat given locks it.
    service
      .from("ticket_seat")
      .select("ticket_id", { count: "exact", head: true })
      .eq("event_id", eventId),
    Promise.all(
      planSections.map((section) =>
        service
          .from("ticket_seat")
          .select("ticket_id", { count: "exact", head: true })
          .eq("event_id", eventId)
          .eq("section_id", section.id),
      ),
    ),
    Promise.all(
      (types.data ?? []).map((type) =>
        service
          .from("ticket")
          .select("id", { count: "exact", head: true })
          .eq("ticket_type_id", type.id)
          .in("status", ["active", "used"]),
      ),
    ),
  ]);
  if ([anySeat, ...given, ...sold].some((r) => r.error)) {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  const seatsGiven: Record<string, number> = {};
  planSections.forEach((section, i) => {
    const count = given[i].count ?? 0;
    if (count > 0) seatsGiven[section.id] = count;
  });
  return {
    status: 200,
    data: {
      plans,
      planId: seating.data?.plan_id ?? null,
      ticketTypes: (types.data ?? []).map((t, i) => ({
        id: t.id,
        type: t.type,
        quantity: t.quantity,
        admits: t.admits ?? 1,
        sectionId: t.seating_section_id ?? null,
        sold: sold[i].count ?? 0,
      })),
      seatsGiven,
      locked: (anySeat.count ?? 0) > 0,
      inRun: !!event.series_id,
    },
  };
}

/**
 * Creates a plan, or changes one the organizer owns. Its sections change
 * only while no event has given out a seat in them (names always can).
 */
export async function saveSeatingPlanCore(
  accountId: string,
  input: SeatingPlanInput & { planId?: string | null },
): Promise<{ status: 200; message: string; data: { planId: string } } | Fail> {
  const problem = seatingPlanProblem(input);
  if (problem) {
    return { status: 400, message: seatingProblemMessage(coreT(), problem) };
  }
  const service = getSupabaseServiceClient();

  let planId = input.planId ?? null;
  if (planId) {
    const { data: plan } = await service
      .from("seating_plan")
      .select("id, owner_id, seating_section(id)")
      .eq("id", planId)
      .maybeSingle();
    if (!plan || plan.owner_id !== accountId) {
      return { status: 404, message: tr("seatingPlanNotFound") };
    }
    const sectionIds = (plan.seating_section ?? []).map((s) => s.id);
    if (sectionIds.length > 0) {
      const { count } = await service
        .from("ticket_seat")
        .select("ticket_id", { count: "exact", head: true })
        .in("section_id", sectionIds);
      const changingSections =
        input.sections.some((s) => !s.id || !sectionIds.includes(s.id)) ||
        sectionIds.some((id) => !input.sections.some((s) => s.id === id));
      if ((count ?? 0) > 0 && changingSections) {
        return { status: 409, message: tr("seatsAlreadyGivenPlanLocked") };
      }
      // Removed sections go (a ticket type selling one stops being seated).
      const keep = input.sections.map((s) => s.id).filter(Boolean) as string[];
      const drop = sectionIds.filter((id) => !keep.includes(id));
      if (drop.length > 0) {
        const { error } = await service
          .from("seating_section")
          .delete()
          .in("id", drop);
        if (error) return { status: 500, message: tr("somethingWentWrong") };
      }
    }
    const { error } = await service
      .from("seating_plan")
      .update({ name: input.name.trim(), updated_at: new Date().toISOString() })
      .eq("id", planId);
    if (error) return { status: 500, message: tr("somethingWentWrong") };
  } else {
    const { data, error } = await service
      .from("seating_plan")
      .insert({ owner_id: accountId, name: input.name.trim() })
      .select("id")
      .single();
    if (error || !data)
      return { status: 500, message: tr("somethingWentWrong") };
    planId = data.id;
  }

  for (const [position, section] of input.sections.entries()) {
    const row = {
      plan_id: planId as string,
      name: section.name.trim(),
      position,
      rows: section.rows.map((r) => ({
        label: r.label.trim(),
        seats: r.seats,
      })),
    };
    const { error } = section.id
      ? await service
          .from("seating_section")
          .update(row)
          .eq("id", section.id)
          .eq("plan_id", planId as string)
      : await service.from("seating_section").insert(row);
    if (error) {
      logger.error(`seating: section save failed (${error.message})`);
      return {
        status: error.code === CHECK_VIOLATION ? 400 : 500,
        message:
          error.code === CHECK_VIOLATION
            ? userFacingError("Save seating plan", error)
            : tr("somethingWentWrong"),
      };
    }
  }

  return {
    status: 200,
    message: tr("seatingPlanSaved"),
    data: { planId: planId as string },
  };
}

/** What event_seating_set() refused, by the hint it raised with. */
function seatingRefusal(error: {
  message: string;
  code?: string;
  hint?: string | null;
  details?: string | null;
}): Fail {
  let detail: Record<string, unknown> = {};
  try {
    detail = error.details ? JSON.parse(error.details) : {};
  } catch {
    detail = {};
  }
  const section = String(detail.section ?? "");
  const seats = Number(detail.seats ?? 0);
  switch (error.hint) {
    case "seating_locked":
      return { status: 409, message: tr("seatingLockedSeatsGiven") };
    case "seating_busy":
      return { status: 409, message: tr("seatingBusyTryAgain") };
    case "seating_event_not_found":
      return { status: 404, message: tr("eventNotFoundOrUnauthorized") };
    case "seating_plan_not_found":
      return { status: 404, message: tr("seatingPlanNotFound") };
    case "seating_section_not_in_plan":
      return { status: 400, message: tr("seatingSectionNotInPlan") };
    case "seating_sold_do_not_fit":
      return {
        status: 409,
        message: tr("seatingSoldDoNotFit", {
          section,
          seats,
          taken: Number(detail.taken ?? 0),
        }),
      };
    case "seating_section_oversold":
      return {
        status: 400,
        message: tr("seatingSectionOversold", {
          section,
          seats,
          selling: Number(detail.selling ?? 0),
        }),
      };
  }
  // Another rule of the database (the event's capacity, a section's stock
  // checked when the change is saved).
  if (error.code === CHECK_VIOLATION) {
    return { status: 400, message: userFacingError("Save seating", error) };
  }
  logger.error(`seating: save failed (${error.message})`);
  return { status: 500, message: tr("somethingWentWrong") };
}

/**
 * Gives an event a plan (or none) and each ticket type a section (or none),
 * until a seat has been given to one of its tickets. A seated type sells
 * what its section has left after what it already holds: a type without a
 * number, or with more, is set to that (before any sale: the section's
 * seats). Tickets already sold for a now-seated type get the best seats
 * left, earliest purchase first, and each holder is told their seat: all
 * in one transaction in the database (event_seating_set).
 */
export async function setEventSeatingCore(
  supabase: SupabaseClient<Database>,
  accountId: string,
  input: {
    eventId: string;
    planId: string | null;
    sections: Record<string, string | null>;
  },
): Promise<
  | {
      status: 200;
      message: string;
      data: { seated: number; holders: number };
    }
  | Fail
> {
  const event = await ownEvent(supabase, accountId, input.eventId);
  if ("status" in event && "message" in event) return event;
  const gateLocked = await gatePartnerLockRefusal(input.eventId, "edit");
  if (gateLocked) return gateLocked;

  if (input.planId) {
    const plans = await plansOf(accountId);
    if (!plans) return { status: 500, message: tr("somethingWentWrong") };
    const plan = plans.find((p) => p.id === input.planId);
    if (!plan) return { status: 404, message: tr("seatingPlanNotFound") };
    const sectionIds = new Set(plan.sections.map((s) => s.id));
    for (const sectionId of Object.values(input.sections)) {
      if (sectionId && !sectionIds.has(sectionId)) {
        return { status: 400, message: tr("seatingSectionNotInPlan") };
      }
    }
  }

  const service = getSupabaseServiceClient();
  // A ticket whose amount the buyer chooses is entry, never a seat.
  const { data: types, error: typesError } = await service
    .from("ticket_type")
    .select("id, amount_mode")
    .eq("event_id", input.eventId);
  if (typesError) return { status: 500, message: tr("somethingWentWrong") };
  if (
    input.planId &&
    (types ?? []).some(
      (t) => t.amount_mode === "open" && !!input.sections[t.id],
    )
  ) {
    return {
      status: 400,
      message: openAmountTypeProblemMessage(coreT(), "seating"),
    };
  }

  const { data, error } = await service.rpc("event_seating_set", {
    p_event_id: input.eventId,
    // PostgREST drops undefined keys: every argument is sent.
    p_plan_id: input.planId ?? (null as never),
    p_sections: input.planId ? input.sections : {},
  });
  if (error) return seatingRefusal(error);

  const result = (data ?? {}) as { seated?: number; holders?: number };
  const seated = result.seated ?? 0;
  return {
    status: 200,
    message:
      seated > 0
        ? tr("seatingSavedSeated", { count: seated })
        : tr("seatingSaved"),
    data: { seated, holders: result.holders ?? 0 },
  };
}
