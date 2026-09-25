import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// What a listing owner may and may not write straight through the Data API
// (migration 20260925110100). Owners keep editing their own content; the
// market-derived and paid-for columns are the service's.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
