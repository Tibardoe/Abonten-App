import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// What a listing owner may and may not write straight through the Data API
// (migration 20260925110100). Owners keep editing their own content; the
// market-derived and paid-for columns are the service's.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postEventCore } from "../events/postEventCore";
import { updateEventCore } from "../events/updateEventCore";
import { postPlaceCore } from "../places/postPlaceCore";
import { updatePlaceCore } from "../places/updatePlaceCore";
import { getPromoCodeCore } from "../promo-codes/getPromoCodeCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("listing column guards", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let eventId: string;

  beforeAll(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    ({ eventId } = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 5,
      price: 50,
    }));
  });

  afterAll(async () => {
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await deleteTestUser(service, organizer.id);
  });

  it.each([
    ["featured", true],
    ["currency", "NGN"],
    ["country_code", "NG"],
    ["timezone", "Asia/Tokyo"],
    ["published_at", "2020-01-01T00:00:00Z"],
    ["archived_at", "2020-01-01T00:00:00Z"],
  ])("an organizer cannot set event.%s directly", async (column, value) => {
    const { error } = await organizer.client
      .from("event")
      .update({ [column]: value } as never)
      .eq("id", eventId);
    expect(error?.code).toBe("42501");
  });

  it("an organizer still edits their own event's content", async () => {
    const { error } = await organizer.client
      .from("event")
      .update({ description: "Updated by its organizer." })
      .eq("id", eventId);
    expect(error).toBeNull();
  });

  it("the service can still correct a listing's zone", async () => {
    const { error } = await service
      .from("event")
      .update({ timezone: "Africa/Accra" })
      .eq("id", eventId);
    expect(error).toBeNull();
  });

  it("refuses a ticket price finer than its currency", async () => {
    const { error } = await organizer.client
      .from("ticket_type")
      .update({ price: 10.005 })
      .eq("event_id", eventId);
    expect(error?.message).toMatch(/decimal places/);
  });

  it("clients cannot insert an event row directly", async () => {
    const { error } = await organizer.client.from("event").insert({
      organizer_id: organizer.id,
      title: "Direct insert",
      slug: `direct-${crypto.randomUUID()}`,
      event_code: crypto.randomUUID().slice(0, 8),
      featured: true,
      country_code: "GH",
      timezone: "Africa/Accra",
      currency: "GHS",
    } as never);
    expect(error?.code).toBe("42501");
  });
});

describe("attendance, ticket and payout-account writes (migration 20260925110200)", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let guest: TestUser;
  let stranger: TestUser;
  let eventId: string;
  let ticketId: string;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, guest, stranger] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 5,
      price: 0,
    });
    eventId = fixture.eventId;
    await service
      .from("ticket_type")
      .update({ type: "FREE" })
      .eq("id", fixture.ticketTypeId);
    const { data, error } = await service.rpc("issue_free_ticket", {
      p_user_id: guest.id,
      p_event_id: eventId,
      p_occurrence_id: null,
      p_ticket_code: `TKT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      p_qr_public_id: "test/qr",
      p_qr_version: "1",
      p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    } as unknown as Database["public"]["Functions"]["issue_free_ticket"]["Args"]);
    if (error) throw new Error(error.message);
    ticketId = data as string;
  });

  afterAll(async () => {
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await Promise.all(
      [organizer, guest, stranger].map((u) => deleteTestUser(service, u.id)),
    );
  });

  it("no one can claim a spot at someone else's event by writing attendance", async () => {
    const { error } = await stranger.client.from("attendance").insert({
      user_id: stranger.id,
      event_id: eventId,
      number_of_tickets: 90,
      status: "attending",
    });
    expect(error?.code).toBe("42501");
  });

  it("an attendee cannot grow their own attendance", async () => {
    const { error } = await guest.client
      .from("attendance")
      .update({ number_of_tickets: 50 })
      .eq("user_id", guest.id);
    expect(error?.code).toBe("42501");
  });

  it("an organizer cannot move a ticket to another account", async () => {
    const { error } = await organizer.client
      .from("ticket")
      .update({ user_id: organizer.id })
      .eq("id", ticketId);
    expect(error?.code).toBe("42501");
  });

  it("an organizer can still check a ticket in and undo it", async () => {
    const checkIn = await organizer.client
      .from("ticket")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", ticketId);
    expect(checkIn.error).toBeNull();
    const undo = await organizer.client
      .from("ticket")
      .update({ status: "active", used_at: null })
      .eq("id", ticketId);
    expect(undo.error).toBeNull();
  });

  it("an attendee can still cancel their attendance row", async () => {
    const { error } = await guest.client
      .from("attendance")
      .update({ status: "cancelled" })
      .eq("user_id", guest.id);
    expect(error).toBeNull();
  });

  it("payout accounts can't be written around the service's checks", async () => {
    const { error } = await organizer.client.from("payout_account").insert({
      organizer_id: organizer.id,
      account_type: "bank",
      account_holder_name: "Forged",
      account_number: "0551234987",
      country_code: "NG",
      currency: "NGN",
    });
    expect(error?.code).toBe("42501");
  });
});

describe("place booking transitions (migration 20260925110300)", () => {
  let service: SupabaseClient<Database>;
  let owner: TestUser;
  let customer: TestUser;
  let placeId: string;

  beforeAll(async () => {
    service = getServiceClient();
    [owner, customer] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: owner.id,
        name: "Booking Guard Venue",
        slug: `booking-guard-${crypto.randomUUID()}`,
        description: "Created by the listing-guards suite.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    placeId = data.id;
  });

  afterAll(async () => {
    await service.from("place_booking").delete().eq("place_id", placeId);
    await service.from("place").delete().eq("id", placeId);
    await Promise.all(
      [owner, customer].map((u) => deleteTestUser(service, u.id)),
    );
  });

  const request = (status = "pending") =>
    customer.client
      .from("place_booking")
      .insert({
        place_id: placeId,
        customer_id: customer.id,
        requested_time: new Date(Date.now() + 86_400_000).toISOString(),
        party_size: 2,
        status,
      })
      .select("id")
      .single();

  it("a customer cannot book themselves in as accepted", async () => {
    const { error } = await request("accepted");
    expect(error?.code).toBe("42501");
  });

  it("walks request -> accept -> cancel, and refuses the shortcuts", async () => {
    const { data: booking, error } = await request();
    expect(error).toBeNull();
    const id = booking?.id as string;

    const selfAccept = await customer.client
      .from("place_booking")
      .update({ status: "accepted" })
      .eq("id", id);
    expect(selfAccept.error?.code).toBe("42501");

    const moveTime = await customer.client
      .from("place_booking")
      .update({ requested_time: new Date().toISOString() })
      .eq("id", id);
    expect(moveTime.error?.code).toBe("42501");

    const accept = await owner.client
      .from("place_booking")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", id);
    expect(accept.error).toBeNull();

    const cancel = await customer.client
      .from("place_booking")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id);
    expect(cancel.error).toBeNull();
  });
});

describe("promo code visibility (migration 20260925110400)", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let eventId: string;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, buyer] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    ({ eventId } = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 5,
      price: 50,
    }));
    const { error } = await service.from("promo_code").insert({
      event_id: eventId,
      promo_code: "VIPCOMP",
      discount_percentage: 100,
      max_uses: 3,
      times_used: 0,
      is_active: true,
    });
    if (error) throw new Error(error.message);
  });

  afterAll(async () => {
    await service.from("promo_code").delete().eq("event_id", eventId);
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await Promise.all(
      [organizer, buyer].map((u) => deleteTestUser(service, u.id)),
    );
  });

  it("a buyer cannot list an event's codes", async () => {
    const { data } = await buyer.client
      .from("promo_code")
      .select("promo_code")
      .eq("event_id", eventId);
    expect(data).toEqual([]);
  });

  it("the organizer still sees their codes", async () => {
    const { data } = await organizer.client
      .from("promo_code")
      .select("promo_code")
      .eq("event_id", eventId);
    expect(data).toEqual([{ promo_code: "VIPCOMP" }]);
  });

  it("a buyer who knows the code can still apply it", async () => {
    const result = await getPromoCodeCore(
      buyer.client,
      buyer.id,
      "vipcomp",
      eventId,
    );
    expect(result.status).toBe(200);
  });
});

describe("place analytics throttle (migration 20260925110600)", () => {
  it("keeps at most 60 of one event type per place per minute, stamped by the server", async () => {
    const service = getServiceClient();
    const owner = await createTestUser(service);
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: owner.id,
        name: "Analytics Throttle Venue",
        slug: `analytics-throttle-${crypto.randomUUID()}`,
        description: "Created by the listing-guards suite.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      })
      .select("id")
      .single();
    const placeId = place?.id as string;
    try {
      const anon = createClient<Database>(
        process.env.SUPABASE_TEST_URL as string,
        process.env.SUPABASE_TEST_ANON_KEY as string,
        { auth: { persistSession: false } },
      );
      for (let i = 0; i < 70; i++) {
        await anon.from("place_analytics_event").insert({
          place_id: placeId,
          event_type: "view",
          created_at: "2020-01-01T00:00:00Z",
        });
      }
      const { data: rows } = await service
        .from("place_analytics_event")
        .select("created_at")
        .eq("place_id", placeId);
      expect(rows?.length).toBe(60);
      expect(
        rows?.every((r) => new Date(r.created_at).getFullYear() > 2020),
      ).toBe(true);
    } finally {
      await service.from("place").delete().eq("id", placeId);
      await deleteTestUser(service, owner.id);
    }
  });
});

describe("listing creation and edits through the service (service-role create_event)", () => {
  it("an organizer creates and edits an event; a restricted one cannot create", async () => {
    const service = getServiceClient();
    const organizer = await createTestUser(service);
    const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
    const input = {
      title: "service path event",
      description: "Created through postEventCore by the listing-guards suite.",
      category: "conference",
      types: ["Live Concerts"],
      address: "Independence Avenue, Accra",
      addressDetails: { country_code: "GH", city: "Accra" },
      latitude: 5.6037,
      longitude: -0.187,
      capacity: 50,
      requireRegistration: false,
      startsAt: inTwoDays.toISOString(),
      endsAt: new Date(inTwoDays.getTime() + 3_600_000).toISOString(),
      singleTicket: { price: 25, quantity: 20 },
      flyerPublicId: "test/flyer",
      flyerVersion: "1",
      clientRequestId: crypto.randomUUID(),
    };
    let eventId: string | null = null;
    try {
      const created = await postEventCore(
        organizer.client,
        organizer.id,
        input,
      );
      expect(created.status, created.message).toBe(200);
      if (created.status !== 200) return;
      eventId = created.eventId;
      const { data: row } = await service
        .from("event")
        .select("organizer_id, country_code, currency, timezone, featured")
        .eq("id", eventId)
        .single();
      expect(row).toMatchObject({
        organizer_id: organizer.id,
        country_code: "GH",
        currency: "GHS",
        timezone: "Africa/Accra",
        featured: false,
      });

      const edited = await updateEventCore(organizer.client, organizer.id, {
        eventId,
        title: "service path event, edited",
        description: input.description,
        address: input.address,
        addressDetails: input.addressDetails,
        latitude: input.latitude,
        longitude: input.longitude,
        capacity: 60,
        category: input.category,
        types: input.types,
        checked: false,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
      });
      expect(edited.status, edited.message).toBe(200);

      await service
        .from("user_info")
        .update({ status_id: 3 })
        .eq("id", organizer.id);
      const refused = await postEventCore(organizer.client, organizer.id, {
        ...input,
        clientRequestId: crypto.randomUUID(),
      });
      expect(refused.status).toBe(403);
    } finally {
      if (eventId)
        await deleteTestEvent(service, eventId).catch(() => undefined);
      await deleteTestUser(service, organizer.id);
    }
  });
});

describe("place creation and edits through the service", () => {
  it("an owner creates a place and moves it within Ghana", async () => {
    const service = getServiceClient();
    const owner = await createTestUser(service);
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    let placeId: string | null = null;
    try {
      const created = await postPlaceCore(owner.client, owner.id, {
        name: "Service Path Venue",
        categoryId: category?.id as number,
        description: "Created by the listing-guards suite.",
        address: "Oxford Street, Accra",
        addressDetails: { country_code: "GH", city: "Accra" },
        latitude: 5.556,
        longitude: -0.182,
        coverPublicId: "test/cover",
        coverVersion: "1",
        openingHours: [],
        clientRequestId: crypto.randomUUID(),
      });
      expect(created.status, created.message).toBe(200);
      if (created.status !== 200) return;
      placeId = created.placeId;
      const updated = await updatePlaceCore(owner.client, owner.id, {
        placeId,
        name: "Service Path Venue (Kumasi)",
        description: "Moved by the listing-guards suite.",
        categoryId: category?.id as number,
        address: "Adum, Kumasi",
        addressDetails: { country_code: "GH", city: "Kumasi" },
        latitude: 6.6885,
        longitude: -1.6244,
      });
      expect(updated.status, updated.message).toBe(200);
      const { data: row } = await service
        .from("place")
        .select("name, country_code, timezone")
        .eq("id", placeId)
        .single();
      expect(row).toMatchObject({
        name: "Service Path Venue (Kumasi)",
        country_code: "GH",
        timezone: "Africa/Accra",
      });
    } finally {
      if (placeId) await service.from("place").delete().eq("id", placeId);
      await deleteTestUser(service, owner.id);
    }
  });
});
