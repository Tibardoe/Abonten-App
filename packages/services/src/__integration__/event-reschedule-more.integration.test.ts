import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Moving an event, part 2 (migration 20261120210000,
// docs/architecture/event-reschedule.md): a new venue, a new date and venue,
// one date of an event with several dates, and "postponed, new date to
// come" with everything that waits while an event is postponed (sales,
// lists, settlement, retirement).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import {
  getEventRescheduleForHolderCore,
  getRescheduleSetupCore,
  refundAfterRescheduleCore,
  rescheduleEmailBatchCore,
  rescheduleEventCore,
} from "../events/eventRescheduleCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import {
  getEventSeatingCore,
  saveSeatingPlanCore,
  setEventSeatingCore,
} from "../seating/seatingCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const HOUR = 3_600_000;
const ACCRA = { lat: 5.5566, lng: -0.1969 };
const KUMASI = { lat: 6.6885, lng: -1.6244 };
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(3);
  return {
    title: `Moving More ${crypto.randomUUID().slice(0, 6)}`,
    description: "Created by the reschedule part 2 suite.",
    category: "Arts & Culture",
    types: ["Theatre"],
    address: "National Theatre, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: ACCRA.lat,
    longitude: ACCRA.lng,
    capacity: 50,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 3 * HOUR).toISOString(),
    multipleTickets: [{ type: "Regular", price: 100, quantity: 20 }],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("moving an event: venue, one date, postponed", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let holderA: TestUser;
  let holderB: TestUser;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, holderA, holderB] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
  });

  afterAll(async () => {
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await service.from("seating_plan").delete().eq("owner_id", organizer.id);
    await Promise.all(
      [organizer, holderA, holderB].map((u) => deleteTestUser(service, u.id)),
    );
  });

  async function newEvent(over: Partial<PostEventCoreInput> = {}) {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(over),
    );
    if (created.status !== 200) throw new Error(created.message);
    const { data: type } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", created.eventId)
      .single();
    return { eventId: created.eventId, typeId: type?.id as string };
  }

  async function giveTicket(
    user: TestUser,
    typeId: string,
    occurrenceId: string | null = null,
  ) {
    const { data, error } = await service
      .from("ticket")
      .insert({
        user_id: user.id,
        ticket_type_id: typeId,
        occurrence_id: occurrenceId,
        status: "active",
        qr_public_id: "test/qr",
        qr_version: "1",
        expires_at: inDays(10).toISOString(),
        ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  async function noticesFor(rescheduleId: string) {
    const { data } = await service
      .from("notification")
      .select("user_id, data")
      .eq("type", "event_rescheduled")
      .eq("data->>rescheduleId", rescheduleId);
    return (data ?? []) as {
      user_id: string;
      data: { notice: { id: string; params: Record<string, string> } };
    }[];
  }

  const move = (
    eventId: string,
    over: Partial<Parameters<typeof rescheduleEventCore>[3]> = {},
  ) =>
    rescheduleEventCore(organizer.client, organizer.id, organizer.id, {
      eventId,
      message: "The venue flooded. Same tickets.",
      ...over,
    });

  it("moves the venue alone, and the date and venue together", async () => {
    const { eventId, typeId } = await newEvent();
    await giveTicket(holderA, typeId);

    const venue = await move(eventId, {
      venue: {
        address: "Kumasi Cultural Centre, Kumasi",
        latitude: KUMASI.lat,
        longitude: KUMASI.lng,
      },
    });
    expect(venue.status, venue.message).toBe(200);
    if (venue.status !== 200) return;
    const { data: row } = await service
      .from("event")
      .select("address, place_id, starts_at")
      .eq("id", eventId)
      .single();
    expect((row?.address as { full_address: string }).full_address).toBe(
      "Kumasi Cultural Centre, Kumasi",
    );
    const notices = await noticesFor(venue.data.rescheduleId);
    expect(notices.map((n) => n.data.notice.id)).toEqual([
      "event_venue_changed",
    ]);
    expect(notices[0].data.notice.params.venue).toBe(
      "Kumasi Cultural Centre, Kumasi",
    );

    const view = await getEventRescheduleForHolderCore(
      holderA.client,
      holderA.id,
      eventId,
    );
    expect(view.status === 200 && view.data).toMatchObject({
      kind: "move",
      occurrenceId: null,
      venue: "Kumasi Cultural Centre, Kumasi",
      previousVenue: "National Theatre, Accra",
      postponed: false,
      refundOpen: true,
      activeTickets: 1,
    });
    const batch = await rescheduleEmailBatchCore(venue.data.rescheduleId);
    expect(batch).toMatchObject({
      kind: "move",
      dateChanged: false,
      venue: "Kumasi Cultural Centre, Kumasi",
      userIds: [holderA.id],
    });

    // The same venue again, same date: nothing to move.
    const same = await move(eventId, {
      venue: {
        address: "Kumasi Cultural Centre, Kumasi",
        latitude: KUMASI.lat,
        longitude: KUMASI.lng,
      },
    });
    expect(same.status).toBe(409);

    // A new date and a new venue: one notice saying both.
    const both = await move(eventId, {
      startsAt: inDays(9).toISOString(),
      endsAt: new Date(inDays(9).getTime() + 2 * HOUR).toISOString(),
      venue: {
        address: "National Theatre, Accra",
        latitude: ACCRA.lat,
        longitude: ACCRA.lng,
      },
    });
    expect(both.status, both.message).toBe(200);
    if (both.status !== 200) return;
    const bothNotices = await noticesFor(both.data.rescheduleId);
    expect(bothNotices[0].data.notice.id).toBe("event_moved_venue");
    // Two moves used: a third is refused.
    const third = await move(eventId, {
      startsAt: inDays(11).toISOString(),
      endsAt: new Date(inDays(11).getTime() + 2 * HOUR).toISOString(),
    });
    expect(third.status).toBe(409);
  });

  it("keeps a seated event in its hall", async () => {
    const { eventId, typeId } = await newEvent();
    // The seat map is set before anyone holds a ticket (it locks then).
    const saved = await saveSeatingPlanCore(organizer.id, {
      name: "National Theatre",
      sections: [{ name: "Stalls", rows: [{ label: "A", seats: 20 }] }],
    });
    if (saved.status !== 200) throw new Error("plan");
    const setupSeats = await getEventSeatingCore(
      organizer.client,
      organizer.id,
      eventId,
    );
    if (setupSeats.status !== 200) throw new Error("seats");
    const seated = await setEventSeatingCore(organizer.client, organizer.id, {
      eventId,
      planId: saved.data.planId,
      sections: { [typeId]: setupSeats.data.plans[0].sections[0].id },
    });
    expect(seated.status, seated.message).toBe(200);
    await giveTicket(holderA, typeId);

    const setup = await getRescheduleSetupCore(
      organizer.client,
      organizer.id,
      eventId,
    );
    expect(setup.status === 200 && setup.data.seated).toBe(true);
    const refused = await move(eventId, {
      venue: {
        address: "Kumasi Cultural Centre, Kumasi",
        latitude: KUMASI.lat,
        longitude: KUMASI.lng,
      },
    });
    expect(refused).toMatchObject({
      status: 409,
      message: "An event with a seating plan can't move to another venue.",
    });
  });

  it("moves one date of an event with several dates, for its holders only", async () => {
    const d1 = inDays(5);
    const d2 = inDays(8);
    const { eventId, typeId } = await newEvent({
      startsAt: null,
      endsAt: null,
      specificDates: [
        {
          start: d1.toISOString(),
          end: new Date(d1.getTime() + 2 * HOUR).toISOString(),
        },
        {
          start: d2.toISOString(),
          end: new Date(d2.getTime() + 2 * HOUR).toISOString(),
        },
      ],
    });
    const { data: dates } = await service
      .from("event_occurrence")
      .select("id, starts_at")
      .eq("event_id", eventId)
      .order("starts_at");
    const [first, second] = dates ?? [];
    const ticketA = await giveTicket(holderA, typeId, first.id);
    const ticketB = await giveTicket(holderB, typeId, second.id);

    const setup = await getRescheduleSetupCore(
      organizer.client,
      organizer.id,
      eventId,
    );
    expect(setup.status === 200 && setup.data.dates.map((d) => d.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(setup.status === 200 && setup.data.canPostpone).toBe(false);

    // The whole event, or a postponement: refused.
    expect(
      (
        await move(eventId, {
          startsAt: inDays(12).toISOString(),
          endsAt: inDays(12.1).toISOString(),
        })
      ).status,
    ).toBe(409);
    expect((await move(eventId, { postpone: true })).status).toBe(409);
    // One date with a new venue: the venue is for every date.
    expect(
      (
        await move(eventId, {
          occurrenceId: second.id,
          startsAt: inDays(12).toISOString(),
          endsAt: inDays(12.1).toISOString(),
          venue: {
            address: "Kumasi Cultural Centre, Kumasi",
            latitude: KUMASI.lat,
            longitude: KUMASI.lng,
          },
        })
      ).status,
    ).toBe(409);

    const newStart = inDays(12);
    const newEnd = new Date(newStart.getTime() + 2 * HOUR);
    const moved = await move(eventId, {
      occurrenceId: second.id,
      startsAt: newStart.toISOString(),
      endsAt: newEnd.toISOString(),
    });
    expect(moved.status, moved.message).toBe(200);
    if (moved.status !== 200) return;
    const notices = await noticesFor(moved.data.rescheduleId);
    expect(notices.map((n) => n.user_id)).toEqual([holderB.id]);
    expect(notices[0].data.notice.id).toBe("event_date_moved");
    expect(notices[0].data.notice.params.previousStartsAt).toBeTruthy();

    const { data: occ } = await service
      .from("event_occurrence")
      .select("starts_at")
      .eq("id", second.id)
      .single();
    expect(new Date(occ?.starts_at as string).getTime()).toBe(
      newStart.getTime(),
    );
    const { data: tickets } = await service
      .from("ticket")
      .select("id, expires_at")
      .in("id", [ticketA, ticketB]);
    for (const t of tickets ?? []) {
      expect(new Date(t.expires_at).getTime()).toBe(newEnd.getTime());
    }

    // Holder A's date did not move.
    const viewA = await getEventRescheduleForHolderCore(
      holderA.client,
      holderA.id,
      eventId,
    );
    expect(viewA.status === 200 && viewA.data).toBeNull();
    const viewB = await getEventRescheduleForHolderCore(
      holderB.client,
      holderB.id,
      eventId,
    );
    expect(viewB.status === 200 && viewB.data).toMatchObject({
      occurrenceId: second.id,
      refundOpen: true,
      activeTickets: 1,
    });

    // Holder B gives back that date's ticket; A's stays.
    const back = await refundAfterRescheduleCore(
      holderB.client,
      holderB.id,
      eventId,
    );
    expect(back.status, back.message).toBe(200);
    const { data: after } = await service
      .from("ticket")
      .select("id, status")
      .in("id", [ticketA, ticketB]);
    const status = Object.fromEntries(
      (after ?? []).map((t) => [t.id, t.status]),
    );
    expect(status[ticketA]).toBe("active");
    expect(status[ticketB]).toBe("cancelled");
  });

  it("postpones an event: sales, lists, money and retirement wait for the new date", async () => {
    const { eventId, typeId } = await newEvent();
    const ticketA = await giveTicket(holderA, typeId);
    await giveTicket(holderB, typeId);

    const postponed = await move(eventId, { postpone: true });
    expect(postponed.status, postponed.message).toBe(200);
    if (postponed.status !== 200) return;
    expect(postponed.data.refundUntil).toBeNull();
    const notices = await noticesFor(postponed.data.rescheduleId);
    expect(new Set(notices.map((n) => n.data.notice.id))).toEqual(
      new Set(["event_postponed"]),
    );
    expect(notices).toHaveLength(2);

    // Once only, and not while postponed.
    expect((await move(eventId, { postpone: true })).status).toBe(409);
    expect(
      (
        await move(eventId, {
          venue: {
            address: "Kumasi Cultural Centre, Kumasi",
            latitude: KUMASI.lat,
            longitude: KUMASI.lng,
          },
        })
      ).status,
    ).toBe(409);

    // Clients cannot lift a postponement.
    const lift = await organizer.client
      .from("event")
      .update({ postponed_at: null })
      .eq("id", eventId);
    expect(lift.error?.message ?? "").toMatch(/goes through moving it/);

    // No sales, not listed, not settled.
    const order = await validateCheckoutCore(holderA.client, holderA.id, {
      eventId,
      quantities: { [typeId]: 1 },
    });
    expect(order.status).not.toBe(200);
    const { data: nearby } = await service.rpc("get_nearby_events", {
      user_lat: ACCRA.lat,
      user_lng: ACCRA.lng,
      search_radius: 50_000,
      p_cursor_sort_key: null,
      p_cursor_id: null,
      p_page_size: 1000,
    } as never);
    expect(((nearby ?? []) as { id: string }[]).map((r) => r.id)).not.toContain(
      eventId,
    );

    // Its old date passes: still not over.
    await service
      .from("event")
      .update({
        starts_at: inDays(-2).toISOString(),
        ends_at: new Date(inDays(-2).getTime() + 3 * HOUR).toISOString(),
      })
      .eq("id", eventId);
    const { data: settled } = await service.rpc("is_event_settled", {
      p_event_id: eventId,
    });
    expect(settled).toBe(false);
    await service.rpc("retire_ended_events");
    const { data: kept } = await service
      .from("event")
      .select("archived_at, postponed_at")
      .eq("id", eventId)
      .single();
    expect(kept?.archived_at).toBeNull();
    expect(kept?.postponed_at).not.toBeNull();

    // Holders may give tickets back while it is postponed.
    const view = await getEventRescheduleForHolderCore(
      holderB.client,
      holderB.id,
      eventId,
    );
    expect(view.status === 200 && view.data).toMatchObject({
      kind: "postpone",
      postponed: true,
      refundOpen: true,
      refundUntil: null,
    });
    const back = await refundAfterRescheduleCore(
      holderB.client,
      holderB.id,
      eventId,
    );
    expect(back.status, back.message).toBe(200);

    // The new date: the postponement lifts, the usual window opens, and
    // only the people still holding tickets are told.
    const newStart = inDays(20);
    const dated = await move(eventId, {
      startsAt: newStart.toISOString(),
      endsAt: new Date(newStart.getTime() + 3 * HOUR).toISOString(),
      message: "New date: in three weeks.",
    });
    expect(dated.status, dated.message).toBe(200);
    if (dated.status !== 200) return;
    expect(dated.data.refundUntil).not.toBeNull();
    const datedNotices = await noticesFor(dated.data.rescheduleId);
    expect(datedNotices.map((n) => n.user_id)).toEqual([holderA.id]);
    expect(datedNotices[0].data.notice.id).toBe("event_rescheduled");
    const { data: live } = await service
      .from("event")
      .select("postponed_at, starts_at")
      .eq("id", eventId)
      .single();
    expect(live?.postponed_at).toBeNull();
    const { data: ticket } = await service
      .from("ticket")
      .select("expires_at")
      .eq("id", ticketA)
      .single();
    expect(new Date(ticket?.expires_at as string).getTime()).toBe(
      newStart.getTime() + 3 * HOUR,
    );
    const { data: listed } = await service.rpc("get_nearby_events", {
      user_lat: ACCRA.lat,
      user_lng: ACCRA.lng,
      search_radius: 50_000,
      p_cursor_sort_key: null,
      p_cursor_id: null,
      p_page_size: 1000,
    } as never);
    expect(((listed ?? []) as { id: string }[]).map((r) => r.id)).toContain(
      eventId,
    );
  });
});
