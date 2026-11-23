import { placeLocalDate } from "@abonten/core/placeSpecialHours";
import { addCalendarDays } from "@abonten/core/time/timeZone";
import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Ticket notes and holiday hours (migration 20261123091000, PROJECT.md
// §90):
//   * a ticket type's note is written by create_event, stays editable after
//     the first sale through the notes-only path (the full editor locks),
//     is refused with a link by the service and the database, and is
//     copied to a run's new show by event_add_show;
//   * a place's special dates are written by its owner only, read by
//     everyone for a published place, and replace the weekday's hours.
// The agreement of every "open now" copy (SQL lists, place_is_open_now and
// @abonten/core/computePlaceOpenStatus) with special dates is checked in
// explore-lists.integration.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addEventShowsCore } from "../events/eventShowsCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import { updateEventTicketTypesCore } from "../events/updateEventTicketTypesCore";
import { updateTicketTypeNotesCore } from "../events/updateTicketTypeNotesCore";
import {
  addPlaceSpecialHoursCore,
  fetchUpcomingPlaceSpecialHours,
  removePlaceSpecialHoursCore,
} from "../places/placeSpecialHoursCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const ACCRA = "Africa/Accra";

function eventInput(
  over: Partial<PostEventCoreInput> = {},
): PostEventCoreInput {
  const start = inDays(3);
  return {
    title: `Park Day ${crypto.randomUUID().slice(0, 6)}`,
    description: "Created by the ticket notes suite.",
    category: "Entertainment & Shows",
    types: ["Live Concerts"],
    address: "Funworld, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.5566,
    longitude: -0.1969,
    capacity: 200,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 8 * 3_600_000).toISOString(),
    multipleTickets: [
      {
        type: "Kids",
        price: 50,
        quantity: 80,
        description: "  Kids:\n ages 3–12  ",
      },
      {
        type: "Entry + rides",
        price: 120,
        quantity: null,
        description: "Entry + 50 ride credits",
      },
      { type: "Adult", price: 80, quantity: 60 },
    ],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("ticket notes and holiday hours", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let other: TestUser;
  let anon: SupabaseClient<Database>;
  const placeIds: string[] = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, other] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
  });

  afterAll(async () => {
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await service
      .from("event_series")
      .delete()
      .eq("organizer_id", organizer.id);
    if (placeIds.length) {
      await service.from("place").delete().in("id", placeIds);
    }
    await Promise.all(
      [organizer, other].map((u) => deleteTestUser(service, u.id)),
    );
  });

  async function notesOf(eventId: string) {
    const { data, error } = await service
      .from("ticket_type")
      .select("id, type, price, description")
      .eq("event_id", eventId);
    expect(error).toBeNull();
    return Object.fromEntries(
      (data ?? []).map((row) => [row.type as string, row]),
    );
  }

  it("saves each ticket type's note with the event, folded and trimmed", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      eventInput(),
    );
    expect(created.status, "message" in created ? created.message : "").toBe(
      200,
    );
    if (created.status !== 200) return;
    const notes = await notesOf(created.eventId);
    expect(notes.Kids.description).toBe("Kids: ages 3–12");
    expect(notes["Entry + rides"].description).toBe("Entry + 50 ride credits");
    expect(notes.Adult.description).toBeNull();
  });

  it("refuses a note with a link, in the service and in the database", async () => {
    const refused = await postEventCore(
      organizer.client,
      organizer.id,
      eventInput({
        multipleTickets: [
          {
            type: "Kids",
            price: 50,
            quantity: 10,
            description: "Book at www.example.com",
          },
        ],
      }),
    );
    expect(refused.status).toBe(400);

    const created = await postEventCore(
      organizer.client,
      organizer.id,
      eventInput(),
    );
    if (created.status !== 200) throw new Error("event not created");
    const { Kids } = await notesOf(created.eventId);
    const { error } = await service
      .from("ticket_type")
      .update({ description: "see https://example.com" })
      .eq("id", Kids.id);
    expect(error?.code).toBe("23514");
  });

  it("keeps the note editable after the first sale, and only the note", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      eventInput(),
    );
    if (created.status !== 200) throw new Error("event not created");
    const before = await notesOf(created.eventId);

    // A ticket is sold: the full ticket editor locks.
    await service.from("ticket").insert({
      user_id: other.id,
      ticket_type_id: before.Kids.id,
      status: "active",
      qr_public_id: "test/qr",
      qr_version: "1",
      expires_at: inDays(4).toISOString(),
      ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
    });
    const locked = await updateEventTicketTypesCore(
      organizer.client,
      organizer.id,
      {
        eventId: created.eventId,
        currency: null,
        freeEvent: false,
        singleTicket: null,
        multipleTickets: [{ type: "Kids", price: 1, quantity: 1 }],
      },
    );
    expect(locked.status).toBe(409);

    // The notes still change, through their own path.
    const saved = await updateTicketTypeNotesCore(
      organizer.client,
      organizer.id,
      {
        eventId: created.eventId,
        notes: [
          { ticketTypeId: before.Kids.id, description: "Kids: ages 2–11" },
          { ticketTypeId: before.Adult.id, description: "Family day" },
          { ticketTypeId: before["Entry + rides"].id, description: "  " },
        ],
      },
    );
    expect(saved.status, saved.message).toBe(200);
    const after = await notesOf(created.eventId);
    expect(after.Kids.description).toBe("Kids: ages 2–11");
    expect(after.Adult.description).toBe("Family day");
    expect(after["Entry + rides"].description).toBeNull();
    // Nothing else moved.
    expect(after.Kids.price).toBe(before.Kids.price);
    expect(after.Kids.id).toBe(before.Kids.id);

    // Not by someone else: the service says not found, and the Data API
    // changes nothing.
    const stranger = await updateTicketTypeNotesCore(other.client, other.id, {
      eventId: created.eventId,
      notes: [{ ticketTypeId: before.Kids.id, description: "Hijacked" }],
    });
    expect(stranger.status).toBe(404);
    await other.client
      .from("ticket_type")
      .update({ description: "Hijacked" })
      .eq("id", before.Kids.id);
    expect((await notesOf(created.eventId)).Kids.description).toBe(
      "Kids: ages 2–11",
    );

    // A ticket type of another event is not this event's.
    const foreign = await updateTicketTypeNotesCore(
      organizer.client,
      organizer.id,
      {
        eventId: created.eventId,
        notes: [{ ticketTypeId: crypto.randomUUID(), description: "x" }],
      },
    );
    expect(foreign.status).toBe(404);
  });

  it("copies each note to a run's new show", async () => {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      eventInput(),
    );
    if (created.status !== 200) throw new Error("event not created");
    const show = inDays(10);
    const added = await addEventShowsCore(organizer.client, organizer.id, {
      eventId: created.eventId,
      shows: [
        {
          startsAt: show.toISOString(),
          endsAt: new Date(show.getTime() + 8 * 3_600_000).toISOString(),
        },
      ],
      clientRequestId: crypto.randomUUID(),
    });
    expect(added.status, "message" in added ? added.message : "").toBe(200);
    if (added.status !== 200) return;
    const copy = await notesOf(added.data.shows[0].id);
    expect(copy.Kids.description).toBe("Kids: ages 3–12");
    expect(copy["Entry + rides"].description).toBe("Entry + 50 ride credits");
    expect(copy.Adult.description).toBeNull();
  });

  async function makePlace(status: "published" | "draft" = "published") {
    const { data, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: ACCRA,
        owner_id: organizer.id,
        name: `Holiday Hours Park ${crypto.randomUUID().slice(0, 6)}`,
        slug: `holiday-hours-park-${crypto.randomUUID()}`,
        description: "A place for the special dates suite.",
        category_id: 5,
        location: "SRID=4326;POINT(-0.19 5.55)",
        address: { full_address: "Accra, Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    placeIds.push(data.id);
    return data.id as string;
  }

  it("lets the owner add, replace and remove special dates", async () => {
    const placeId = await makePlace();
    const today = placeLocalDate(new Date(), ACCRA);
    const christmas = addCalendarDays(today, 5);

    const closed = await addPlaceSpecialHoursCore(
      organizer.client,
      organizer.id,
      placeId,
      { date: christmas, isClosed: true, label: " Christmas \n Day " },
    );
    expect(closed.status, closed.message).toBe(200);

    // The same date again replaces it.
    const replaced = await addPlaceSpecialHoursCore(
      organizer.client,
      organizer.id,
      placeId,
      {
        date: christmas,
        isClosed: false,
        openTime: "12:00",
        closeTime: "16:00",
        label: "Christmas Day",
      },
    );
    expect(replaced.status, replaced.message).toBe(200);
    const listed = await fetchUpcomingPlaceSpecialHours(
      organizer.client,
      placeId,
      ACCRA,
    );
    expect("data" in listed && listed.data).toEqual([
      expect.objectContaining({
        special_date: christmas,
        is_closed: false,
        open_time: "12:00:00",
        close_time: "16:00:00",
        label: "Christmas Day",
      }),
    ]);

    // Past dates and broken input are refused.
    const past = await addPlaceSpecialHoursCore(
      organizer.client,
      organizer.id,
      placeId,
      { date: addCalendarDays(today, -2), isClosed: true },
    );
    expect(past.status).toBe(400);
    const noTimes = await addPlaceSpecialHoursCore(
      organizer.client,
      organizer.id,
      placeId,
      { date: christmas, isClosed: false, openTime: "09:00" },
    );
    expect(noTimes.status).toBe(400);

    const id =
      replaced.status === 200 && replaced.data ? replaced.data.id : null;
    expect(id).toBeTruthy();
    const removed = await removePlaceSpecialHoursCore(
      organizer.client,
      organizer.id,
      placeId,
      id as string,
    );
    expect(removed.status).toBe(200);
    const again = await removePlaceSpecialHoursCore(
      organizer.client,
      organizer.id,
      placeId,
      id as string,
    );
    expect(again.status).toBe(404);
  });

  it("refuses everyone but the owner, and shows a published place's dates to all", async () => {
    const placeId = await makePlace();
    const draftId = await makePlace("draft");
    const date = addCalendarDays(placeLocalDate(new Date(), ACCRA), 3);

    // Another account: not through the service, not through the Data API.
    const byService = await addPlaceSpecialHoursCore(
      other.client,
      other.id,
      placeId,
      { date, isClosed: true },
    );
    expect(byService.status).toBe(404);
    const direct = await other.client
      .from("place_special_hours")
      .insert({ place_id: placeId, special_date: date, is_closed: true });
    expect(direct.error).not.toBeNull();
    const anonymous = await anon
      .from("place_special_hours")
      .insert({ place_id: placeId, special_date: date, is_closed: true });
    expect(anonymous.error).not.toBeNull();

    // The owner's rows are public for a published place only.
    for (const id of [placeId, draftId]) {
      const res = await addPlaceSpecialHoursCore(
        organizer.client,
        organizer.id,
        id,
        { date, isClosed: true, label: "Founders' Day" },
      );
      expect(res.status, res.message).toBe(200);
    }
    const seen = await anon
      .from("place_special_hours")
      .select("special_date, label")
      .in("place_id", [placeId, draftId]);
    expect(seen.error).toBeNull();
    expect(seen.data).toEqual([{ special_date: date, label: "Founders' Day" }]);

    // Nor can another account change or remove the owner's row.
    const { data: row } = await service
      .from("place_special_hours")
      .select("id")
      .eq("place_id", placeId)
      .single();
    await other.client
      .from("place_special_hours")
      .update({ is_closed: false, open_time: "00:00", close_time: "00:00" })
      .eq("id", row?.id as string);
    await other.client
      .from("place_special_hours")
      .delete()
      .eq("id", row?.id as string);
    const kept = await service
      .from("place_special_hours")
      .select("is_closed")
      .eq("id", row?.id as string)
      .single();
    expect(kept.data?.is_closed).toBe(true);
    const removedByStranger = await removePlaceSpecialHoursCore(
      other.client,
      other.id,
      placeId,
      row?.id as string,
    );
    expect(removedByStranger.status).toBe(404);

    // The database refuses a name with a link, whoever writes it.
    const linked = await service
      .from("place_special_hours")
      .update({ label: "www.example.com" })
      .eq("id", row?.id as string);
    expect(linked.error?.code).toBe("23514");
  });

  it("uses a special date for 'open now' in the place's own zone", async () => {
    const placeId = await makePlace();
    // Open around the clock every day…
    await service.from("place_opening_hours").insert(
      [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        place_id: placeId,
        day_of_week: day,
        open_time: "00:00",
        close_time: "00:00",
        is_closed: false,
      })),
    );
    const open = await anon.rpc("place_is_open_now", { p_place_id: placeId });
    expect(open.data).toBe(true);
    // …but closed today.
    await service.from("place_special_hours").insert({
      place_id: placeId,
      special_date: placeLocalDate(new Date(), ACCRA),
      is_closed: true,
    });
    const closed = await anon.rpc("place_is_open_now", {
      p_place_id: placeId,
    });
    expect(closed.data).toBe(false);
    // Tomorrow it is open again (asked for tomorrow at noon in Accra).
    const tomorrowNoon = `${ymd(inDays(1))}T12:00:00Z`;
    const tomorrow = await anon.rpc("place_is_open_now", {
      p_place_id: placeId,
      p_now: tomorrowNoon,
    });
    expect(tomorrow.data).toBe(true);
  });
});
