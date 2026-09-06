import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Targets the sales-window guard added to create_ticket_checkout in
// migration 20260906213323_checkout_rpc_time_guards: the RPC — not just the
// JS service layer — must refuse to open a checkout for an event that has
// ended, is mid-occurrence with nothing upcoming, is unpublished, or for a
// specific occurrence id that has already started. Proven against the real
// database clock, not by reading the SQL.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const HOUR = 60 * 60 * 1000;

const line = {
  ticket_type_id: "",
  quantity: 1,
  unit_price: 50,
  discount: 0,
  discounted_units: 0,
  amount: 50,
};

function callCheckout(
  client: SupabaseClient<Database>,
  args: {
    userId: string;
    eventId: string;
    ticketTypeId: string;
    occurrenceId?: string | null;
  },
) {
  return client.rpc("create_ticket_checkout", {
    p_user_id: args.userId,
    p_event_id: args.eventId,
    p_occurrence_id: args.occurrenceId ?? null,
    p_promo_code_id: null,
    p_promo_code_text: null,
    p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    p_lines: [{ ...line, ticket_type_id: args.ticketTypeId }],
  } as unknown as Database["public"]["Functions"]["create_ticket_checkout"]["Args"]);
}

describe("create_ticket_checkout: sales-window guard", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let eventId: string;
  let ticketTypeId: string;

  beforeEach(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    buyer = await createTestUser(service);
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 20,
      price: 50,
    });
    eventId = fixture.eventId;
    ticketTypeId = fixture.ticketTypeId;
  });

  afterEach(async () => {
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, buyer.id);
    await deleteTestUser(service, organizer.id);
  });

  it("allows a checkout for a future single-date event", async () => {
    const { data, error } = await callCheckout(service, {
      userId: buyer.id,
      eventId,
      ticketTypeId,
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it("rejects a checkout for a single-date event that has already ended", async () => {
    await service
      .from("event")
      .update({
        starts_at: new Date(Date.now() - 4 * HOUR).toISOString(),
        ends_at: new Date(Date.now() - 2 * HOUR).toISOString(),
      })
      .eq("id", eventId);

    const { error } = await callCheckout(service, {
      userId: buyer.id,
      eventId,
      ticketTypeId,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not open for ticket sales/i);
  });

  it("rejects a checkout for a single-date event that is currently in progress", async () => {
    await service
      .from("event")
      .update({
        starts_at: new Date(Date.now() - HOUR).toISOString(),
        ends_at: new Date(Date.now() + HOUR).toISOString(),
      })
      .eq("id", eventId);

    const { error } = await callCheckout(service, {
      userId: buyer.id,
      eventId,
      ticketTypeId,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not open for ticket sales/i);
  });

  it("rejects a checkout for an unpublished event", async () => {
    await service.from("event").update({ status: "draft" }).eq("id", eventId);

    const { error } = await callCheckout(service, {
      userId: buyer.id,
      eventId,
      ticketTypeId,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not currently on sale/i);
  });

  describe("multi-date events", () => {
    let pastOccurrenceId: string;
    let futureOccurrenceId: string;

    beforeEach(async () => {
      // Multi-date: null out the event's own dates, add one past + one
      // future occurrence.
      await service
        .from("event")
        .update({ starts_at: null, ends_at: null })
        .eq("id", eventId);

      const { data: occ, error } = await service
        .from("event_occurrence")
        .insert([
          {
            event_id: eventId,
            starts_at: new Date(Date.now() - 4 * HOUR).toISOString(),
            ends_at: new Date(Date.now() - 2 * HOUR).toISOString(),
          },
          {
            event_id: eventId,
            starts_at: new Date(Date.now() + 24 * HOUR).toISOString(),
            ends_at: new Date(Date.now() + 26 * HOUR).toISOString(),
          },
        ])
        .select("id, starts_at")
        .order("starts_at", { ascending: true });
      if (error || !occ) throw new Error(`occurrence setup: ${error?.message}`);
      pastOccurrenceId = occ[0].id;
      futureOccurrenceId = occ[1].id;
    });

    it("allows a checkout (no occurrence id) while a future occurrence remains", async () => {
      const { error } = await callCheckout(service, {
        userId: buyer.id,
        eventId,
        ticketTypeId,
      });
      expect(error).toBeNull();
    });

    it("allows a checkout against the future occurrence id", async () => {
      const { error } = await callCheckout(service, {
        userId: buyer.id,
        eventId,
        ticketTypeId,
        occurrenceId: futureOccurrenceId,
      });
      expect(error).toBeNull();
    });

    it("rejects a checkout against an occurrence id that has already started", async () => {
      const { error } = await callCheckout(service, {
        userId: buyer.id,
        eventId,
        ticketTypeId,
        occurrenceId: pastOccurrenceId,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/no longer available/i);
    });

    it("rejects any checkout once every occurrence is in the past", async () => {
      await service
        .from("event_occurrence")
        .update({
          starts_at: new Date(Date.now() - 3 * HOUR).toISOString(),
          ends_at: new Date(Date.now() - HOUR).toISOString(),
        })
        .eq("id", futureOccurrenceId);

      const { error } = await callCheckout(service, {
        userId: buyer.id,
        eventId,
        ticketTypeId,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/not open for ticket sales/i);
    });
  });
});
