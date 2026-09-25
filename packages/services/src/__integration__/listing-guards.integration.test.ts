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
