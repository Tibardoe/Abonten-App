import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Targets create_ticket_checkout (supabase/migrations/20260907095000_allow_
// multiple_tickets_per_event.sql), the RPC every ticket purchase goes
// through. Its inventory reservation is one atomic
// `UPDATE ticket_type SET quantity = quantity - N WHERE quantity >= N`
// (see that migration's own comment: "no read-then-write window") -- this
// test proves that guarantee holds under real concurrent load, not just by
// reading the SQL.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("concurrency: create_ticket_checkout inventory reservation", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyers: TestUser[];
  let eventId: string;
  let ticketTypeId: string;

  const CAPACITY = 3;
  const BUYER_COUNT = 8;

  beforeEach(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    buyers = await Promise.all(
      Array.from({ length: BUYER_COUNT }, () => createTestUser(service)),
    );

    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: CAPACITY,
      price: 50,
    });
    eventId = fixture.eventId;
    ticketTypeId = fixture.ticketTypeId;
  });

  afterEach(async () => {
    await deleteTestEvent(service, eventId);
    await Promise.all(buyers.map((b) => deleteTestUser(service, b.id)));
    await deleteTestUser(service, organizer.id);
  });

  it(`never oversells: ${BUYER_COUNT} concurrent buyers against ${CAPACITY} tickets yields exactly ${CAPACITY} successes`, async () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

    const results = await Promise.all(
      buyers.map((buyer) =>
        service.rpc("create_ticket_checkout", {
          p_user_id: buyer.id,
          p_event_id: eventId,
          p_occurrence_id: null,
          p_promo_code_id: null,
          p_promo_code_text: null,
          p_expires_at: expiresAt,
          p_lines: [
            {
              ticket_type_id: ticketTypeId,
              quantity: 1,
              unit_price: 50,
              discount: 0,
              discounted_units: 0,
              amount: 50,
            },
          ],
          // Same generated-type gap create_event's fixture helper documents.
        } as unknown as Database["public"]["Functions"]["create_ticket_checkout"]["Args"]),
      ),
    );

    const succeeded = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);

    expect(succeeded).toHaveLength(CAPACITY);
    expect(failed).toHaveLength(BUYER_COUNT - CAPACITY);
    for (const r of failed) {
      expect(r.error?.message).toMatch(/no longer available/i);
    }

    const { data: ticketType } = await service
      .from("ticket_type")
      .select("quantity")
      .eq("id", ticketTypeId)
      .single();
    expect(ticketType?.quantity).toBe(0);

    const { count } = await service
      .from("ticket_checkout")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);
    expect(count).toBe(CAPACITY);
  });
});
