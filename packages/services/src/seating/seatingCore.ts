// Assigned seats (docs/architecture/assigned-seats.md). An organizer (or a
// team member acting for them, events.manage) describes a venue once as a
// seating plan and gives an event a plan and each ticket type a section.
// Seats are then given by the database when tickets are issued
// (ticket_assign_seat). Every seating table is service-role only, so the
// checks of who may read or change what are here.

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
import { getEventHasConfirmedParticipationCore } from "../events/getEventHasConfirmedParticipationCore";
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
  }[];
  /** Seats already given, per section id. */
  seatsGiven: Record<string, number>;
  /** The event has its first confirmed ticket: its seating no longer changes. */
  locked: boolean;
};

type Fail = { status: 400 | 403 | 404 | 409 | 500; message: string };

async function ownEvent(
  supabase: SupabaseClient<Database>,
  accountId: string,
  eventId: string,
): Promise<{ id: string; status: string } | Fail> {
  const { data, error } = await supabase
    .from("event")
    .select("id, status")
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
  const [plans, seating, types, seats, participation] = await Promise.all([
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
    service.from("ticket_seat").select("section_id").eq("event_id", eventId),
    getEventHasConfirmedParticipationCore(supabase, accountId, eventId),
  ]);
  if (!plans || seating.error || types.error || seats.error) {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  const seatsGiven: Record<string, number> = {};
  for (const row of seats.data ?? []) {
    seatsGiven[row.section_id] = (seatsGiven[row.section_id] ?? 0) + 1;
  }
  return {
    status: 200,
    data: {
      plans,
      planId: seating.data?.plan_id ?? null,
      ticketTypes: (types.data ?? []).map((t) => ({
        id: t.id,
        type: t.type,
        quantity: t.quantity,
        admits: t.admits ?? 1,
        sectionId: t.seating_section_id ?? null,
      })),
      seatsGiven,
      locked: participation.status === 200 ? !!participation.data : false,
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

/**
 * Gives an event a plan (or none) and each ticket type a section (or
 * none). A seated type sells at most its section's seats: a type without
 * a number, or with more than the section holds, is set to the section's
 * seats. Locked once the event has its first confirmed ticket.
 */
export async function setEventSeatingCore(
  supabase: SupabaseClient<Database>,
  accountId: string,
  input: {
    eventId: string;
    planId: string | null;
    sections: Record<string, string | null>;
  },
): Promise<{ status: 200; message: string } | Fail> {
  const event = await ownEvent(supabase, accountId, input.eventId);
  if ("status" in event && "message" in event) return event;

  const participation = await getEventHasConfirmedParticipationCore(
    supabase,
    accountId,
    input.eventId,
  );
  if (participation.status !== 200) {
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (participation.data) {
    return { status: 409, message: tr("seatingLockedAfterFirstTicket") };
  }

  const service = getSupabaseServiceClient();
  let seatsBySection = new Map<string, number>();
  if (input.planId) {
    const plans = await plansOf(accountId);
    const plan = plans?.find((p) => p.id === input.planId);
    if (!plan) return { status: 404, message: tr("seatingPlanNotFound") };
    seatsBySection = new Map(plan.sections.map((s) => [s.id, s.seatCount]));
    for (const sectionId of Object.values(input.sections)) {
      if (sectionId && !seatsBySection.has(sectionId)) {
        return { status: 400, message: tr("seatingSectionNotInPlan") };
      }
    }
  }

  // Unseat every type first, so a section changing hands never counts twice.
  const { data: types, error: typesError } = await service
    .from("ticket_type")
    .select("id, quantity, amount_mode")
    .eq("event_id", input.eventId);
  if (typesError) return { status: 500, message: tr("somethingWentWrong") };
  // A ticket whose amount the buyer chooses is entry, never a seat.
  if (
    (types ?? []).some(
      (t) => t.amount_mode === "open" && !!input.sections[t.id],
    )
  ) {
    return {
      status: 400,
      message: openAmountTypeProblemMessage(coreT(), "seating"),
    };
  }
  const { error: clearError } = await service
    .from("ticket_type")
    .update({ seating_section_id: null })
    .eq("event_id", input.eventId);
  if (clearError) return { status: 500, message: tr("somethingWentWrong") };

  if (!input.planId) {
    const { error } = await service
      .from("event_seating")
      .delete()
      .eq("event_id", input.eventId);
    if (error) return { status: 500, message: tr("somethingWentWrong") };
    return { status: 200, message: tr("seatingSaved") };
  }

  const { error: planError } = await service
    .from("event_seating")
    .upsert(
      { event_id: input.eventId, plan_id: input.planId },
      { onConflict: "event_id" },
    );
  if (planError) return { status: 500, message: tr("somethingWentWrong") };

  for (const type of types ?? []) {
    const sectionId = input.sections[type.id] ?? null;
    if (!sectionId) continue;
    const seats = seatsBySection.get(sectionId) ?? 0;
    const quantity =
      type.quantity == null || type.quantity > seats ? seats : type.quantity;
    const { error } = await service
      .from("ticket_type")
      .update({ seating_section_id: sectionId, quantity })
      .eq("id", type.id);
    if (error) {
      return {
        status: error.code === CHECK_VIOLATION ? 400 : 500,
        message:
          error.code === CHECK_VIOLATION
            ? userFacingError("Save seating", error)
            : tr("somethingWentWrong"),
      };
    }
  }

  return { status: 200, message: tr("seatingSaved") };
}
