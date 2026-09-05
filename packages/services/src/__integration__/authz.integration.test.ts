import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Two layers of access control, tested against the real database rather
// than by reading the SQL:
//  1. create_ticket_checkout's own explicit check (`v_caller <> p_user_id`
//     raises 42501) -- a signed-in user can't buy a ticket "as" someone
//     else by passing a different p_user_id.
//  2. RLS on ticket_checkout (enable_rls_ticketing_batch1) -- a signed-in
//     user's own client can only SELECT their own checkout rows, even
//     though the row exists and they know its event.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("authz: create_ticket_checkout and RLS", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let userA: TestUser;
  let userB: TestUser;
  let eventId: string;
  let ticketTypeId: string;

  beforeEach(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    userA = await createTestUser(service);
    userB = await createTestUser(service);

    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 50,
    });
    eventId = fixture.eventId;
    ticketTypeId = fixture.ticketTypeId;
  });

  afterEach(async () => {
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, userA.id);
    await deleteTestUser(service, userB.id);
    await deleteTestUser(service, organizer.id);
  });

  it("rejects a signed-in user buying a ticket on another user's behalf", async () => {
    const { error } = await userA.client.rpc("create_ticket_checkout", {
      p_user_id: userB.id,
      p_event_id: eventId,
      p_occurrence_id: null,
      p_promo_code_id: null,
      p_promo_code_text: null,
      p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
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
    } as unknown as Database["public"]["Functions"]["create_ticket_checkout"]["Args"]);

    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not authorized/i);
  });

  it("hides another buyer's checkout row under RLS even when the event id is known", async () => {
    const { data: checkoutSessionId, error: createError } =
      await userA.client.rpc("create_ticket_checkout", {
        p_user_id: userA.id,
        p_event_id: eventId,
        p_occurrence_id: null,
        p_promo_code_id: null,
        p_promo_code_text: null,
        p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
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
      } as unknown as Database["public"]["Functions"]["create_ticket_checkout"]["Args"]);
    expect(createError).toBeNull();
    expect(checkoutSessionId).toBeTruthy();

    const { data: ownRows, error: ownError } = await userA.client
      .from("ticket_checkout")
      .select("id")
      .eq("checkout_session_id", checkoutSessionId as string);
    expect(ownError).toBeNull();
    expect(ownRows).toHaveLength(1);

    const { data: otherUsersRows, error: otherError } = await userB.client
      .from("ticket_checkout")
      .select("id")
      .eq("checkout_session_id", checkoutSessionId as string);
    expect(otherError).toBeNull();
    expect(otherUsersRows).toHaveLength(0);

    const { data: serviceRows } = await service
      .from("ticket_checkout")
      .select("id")
      .eq("checkout_session_id", checkoutSessionId as string);
    expect(serviceRows).toHaveLength(1);
  });
});
