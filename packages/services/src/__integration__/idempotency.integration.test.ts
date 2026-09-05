import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Two independent duplicate-submission guards, both enforced inside the
// database transaction (not just in application code):
//  1. create_event's client_request_id: a network retry or a double-tapped
//     "Publish" button replays the same client_request_id, and the RPC
//     returns the already-created event instead of inserting a second one
//     (see the ON CONFLICT (client_request_id) DO NOTHING in
//     20260902140000_fix_event_type_serialization.sql).
//  2. create_ticket_checkout's one-pending-checkout-per-event unique
//     constraint: a duplicate submit for the same user+event fails loudly
//     instead of silently creating two checkouts for the same cart.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("idempotency: duplicate-submission guards", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;

  beforeEach(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
  });

  afterEach(async () => {
    await deleteTestUser(service, organizer.id);
  });

  it("create_event replays the same client_request_id into the same event, never a duplicate", async () => {
    const clientRequestId = crypto.randomUUID();
    const args = {
      p_client_request_id: clientRequestId,
      p_organizer_id: organizer.id,
      p_title: "Idempotency Test Event",
      p_slug: `idempotency-test-event-${crypto.randomUUID()}`,
      p_description: "Created by the integration test suite.",
      p_event_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
      p_event_category: "conference",
      p_event_type: ["Live Concerts"],
      p_latitude: 5.6037,
      p_longitude: -0.187,
      p_address: { city: "Accra", country: "Ghana" },
      p_capacity: 100,
      p_website_url: null,
      p_flyer_public_id: "test/flyer",
      p_flyer_version: "1",
      p_starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      p_ends_at: new Date(Date.now() + 90_000_000).toISOString(),
      p_require_registration: false,
      p_featured: false,
      p_specific_dates: null,
      p_ticket_types: null,
      p_promo_codes: null,
      p_receiving_account: null,
      p_place_id: null,
      // Same generated-type gap create_event's fixture helper documents.
    } as unknown as Database["public"]["Functions"]["create_event"]["Args"];

    const first = await service.rpc("create_event", args);
    const second = await service.rpc("create_event", args);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);

    const { count } = await service
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("client_request_id", clientRequestId);
    expect(count).toBe(1);

    if (first.data) await deleteTestEvent(service, first.data);
  });

  it("create_ticket_checkout rejects a second pending checkout for the same user+event", async () => {
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 50,
    });
    const buyer = await createTestUser(service);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const line = {
      ticket_type_id: fixture.ticketTypeId,
      quantity: 1,
      unit_price: 50,
      discount: 0,
      discounted_units: 0,
      amount: 50,
    };
    const checkoutArgs = {
      p_user_id: buyer.id,
      p_event_id: fixture.eventId,
      p_occurrence_id: null,
      p_promo_code_id: null,
      p_promo_code_text: null,
      p_expires_at: expiresAt,
      p_lines: [line],
      // Same generated-type gap create_event's fixture helper documents.
    } as unknown as Database["public"]["Functions"]["create_ticket_checkout"]["Args"];

    const first = await service.rpc("create_ticket_checkout", checkoutArgs);
    const second = await service.rpc("create_ticket_checkout", checkoutArgs);

    expect(first.error).toBeNull();
    expect(second.error).not.toBeNull();
    expect(second.error?.message).toMatch(
      /already have a pending ticket checkout/i,
    );

    await deleteTestUser(service, buyer.id);
    await deleteTestEvent(service, fixture.eventId);
  });
});
