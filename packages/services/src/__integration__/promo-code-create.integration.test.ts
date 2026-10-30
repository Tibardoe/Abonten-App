import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Adding a promo code to an event that already exists (pilot 2026-10-29:
// codes could only be added while creating the event). The organizer's own
// client writes the row, so the insert policy and the free-event trigger
// still apply; the service checks ownership, the terms and duplicates.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPromoCodeCore } from "../promo-codes/eventPromoCodeManageCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("createPromoCodeCore: a code on an existing event", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let stranger: TestUser;
  let eventId: string;
  let freeEventId: string;
  const code = `LATE${Date.now().toString().slice(-6)}`;
  const lastDay = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, stranger] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    ({ eventId } = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 50,
    }));
    ({ eventId: freeEventId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 10, price: 50 },
    ));
    // Made free afterwards, the way an organizer switches an event to free.
    const free = await service
      .from("ticket_type")
      .update({ type: "FREE", price: 0 })
      .eq("event_id", freeEventId);
    if (free.error) throw new Error(free.error.message);
  });

  afterAll(async () => {
    await service.from("promo_code").delete().eq("event_id", eventId);
    await deleteTestEvent(service, eventId);
    await deleteTestEvent(service, freeEventId);
    await deleteTestUser(service, organizer.id);
    await deleteTestUser(service, stranger.id);
  });

  it("adds the code, upper-cased, with no limit and its last day", async () => {
    const result = await createPromoCodeCore(organizer.client, organizer.id, {
      eventId,
      promoCode: ` ${code.toLowerCase()} `,
      discountPercentage: 15,
      maxUses: null,
      expiresAt: lastDay,
    });
    expect(result.status).toBe(200);

    const { data } = await service
      .from("promo_code")
      .select(
        "promo_code, discount_percentage, max_uses, expires_at, is_active",
      )
      .eq("event_id", eventId)
      .single();
    expect(data).toMatchObject({
      promo_code: code,
      discount_percentage: 15,
      max_uses: null,
      is_active: true,
    });
    expect(data?.expires_at?.slice(0, 10)).toBe(lastDay);
  });

  it("refuses the same code twice on one event", async () => {
    const result = await createPromoCodeCore(organizer.client, organizer.id, {
      eventId,
      promoCode: code.toLowerCase(),
      discountPercentage: 20,
      maxUses: 5,
      expiresAt: lastDay,
    });
    expect(result.status).toBe(409);
  });

  it("refuses someone else's event", async () => {
    const result = await createPromoCodeCore(stranger.client, stranger.id, {
      eventId,
      promoCode: "NOTMINE",
      discountPercentage: 10,
      maxUses: 5,
      expiresAt: lastDay,
    });
    expect(result.status).toBe(403);
  });

  it("refuses terms the form would not allow", async () => {
    for (const bad of [
      { discountPercentage: 0, maxUses: 5 },
      { discountPercentage: 101, maxUses: 5 },
      { discountPercentage: 12.5, maxUses: 5 },
      { discountPercentage: 10, maxUses: 0 },
    ]) {
      const result = await createPromoCodeCore(organizer.client, organizer.id, {
        eventId,
        promoCode: "BADTERMS",
        expiresAt: lastDay,
        ...bad,
      });
      expect(result.status).toBe(400);
    }
  });

  it("refuses a free event", async () => {
    const result = await createPromoCodeCore(organizer.client, organizer.id, {
      eventId: freeEventId,
      promoCode: "FREEBIE",
      discountPercentage: 10,
      maxUses: 5,
      expiresAt: lastDay,
    });
    expect(result.status).toBe(400);
    const { count } = await service
      .from("promo_code")
      .select("id", { count: "exact", head: true })
      .eq("event_id", freeEventId);
    expect(count).toBe(0);
  });
});
