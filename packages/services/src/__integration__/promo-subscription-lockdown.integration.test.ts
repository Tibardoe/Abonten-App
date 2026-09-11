import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Migration lock_promo_subscription_writes_and_partial_refund_release: a
// buyer can no longer reset a promo code's usage count, clear their own
// "already used" row, or write subscription rows. The server paths that
// claim and release a code still work.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelTicketCheckoutSessionCore } from "../checkout/cancelTicketCheckoutSessionCore";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("promo codes and subscriptions: clients can't write them", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let eventId: string;
  let ticketTypeId: string;
  let promoCodeId: string;
  const code = `LOCK${Date.now().toString().slice(-6)}`;

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  async function timesUsed(): Promise<number> {
    const { data } = await service
      .from("promo_code")
      .select("times_used")
      .eq("id", promoCodeId)
      .single();
    return data?.times_used as number;
  }

  async function usageRows(): Promise<number> {
    const { count } = await service
      .from("promo_code_usage")
      .select("promo_code_id", { count: "exact", head: true })
      .eq("promo_code_id", promoCodeId)
      .eq("user_id", buyer.id);
    return count ?? 0;
  }

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, buyer] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    ({ eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 10, price: 50 },
    ));
    const { data, error } = await service
      .from("promo_code")
      .insert({
        event_id: eventId,
        promo_code: code,
        discount_percentage: 10,
        max_uses: 5,
        times_used: 0,
        is_active: true,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message);
    promoCodeId = data.id;
  });

  afterAll(async () => {
    await service.from("ticket_checkout").delete().eq("event_id", eventId);
    await service.from("promo_code").delete().eq("id", promoCodeId);
    await deleteTestEvent(service, eventId);
    await Promise.all(
      [organizer, buyer].map((u) => deleteTestUser(service, u.id)),
    );
  });

  it("claims, blocks tampering, and releases a code through the server", async () => {
    const result = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [ticketTypeId]: 2 },
      promoCode: code,
    });
    expect(result.status).toBe(200);
    expect(await timesUsed()).toBe(2);
    expect(await usageRows()).toBe(1);

    // Resetting the count: RLS filters the row out, nothing changes.
    const { data: reset } = await buyer.client
      .from("promo_code")
      .update({ times_used: 0 })
      .eq("id", promoCodeId)
      .select("id");
    expect(reset).toEqual([]);
    expect(await timesUsed()).toBe(2);

    // Clearing the "already used" row, or inventing one.
    const cleared = await buyer.client
      .from("promo_code_usage")
      .delete()
      .eq("promo_code_id", promoCodeId)
      .eq("user_id", buyer.id);
    expect(cleared.error?.code).toBe("42501");
    const invented = await buyer.client.from("promo_code_usage").insert({
      promo_code_id: promoCodeId,
      user_id: buyer.id,
      event_id: eventId,
    });
    expect(invented.error?.code).toBe("42501");
    expect(await usageRows()).toBe(1);

    // Cancelling the checkout gives the code back (service role).
    const cancel = await cancelTicketCheckoutSessionCore(
      buyer.client,
      buyer.id,
      result.checkoutSessionId as string,
    );
    expect(cancel.status).toBe(200);
    expect(await timesUsed()).toBe(0);
    expect(await usageRows()).toBe(0);
  });

  it("still lets the organizer edit their own code", async () => {
    const { data, error } = await organizer.client
      .from("promo_code")
      .update({ discount_percentage: 15 })
      .eq("id", promoCodeId)
      .select("discount_percentage");
    expect(error).toBeNull();
    expect(data).toEqual([{ discount_percentage: 15 }]);
  });

  it("refuses subscription writes", async () => {
    const checkout = await buyer.client.from("subscription_checkout").insert({
      user_id: buyer.id,
      unit_price: 0,
      total_price: 0,
      status: "paid",
    });
    expect(checkout.error?.code).toBe("42501");

    const subscription = await buyer.client.from("subscription").insert({
      user_id: buyer.id,
      plan_id: 1,
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
    expect(subscription.error?.code).toBe("42501");

    const expire = await buyer.client.rpc(
      "expire_stale_subscription_checkouts",
    );
    expect(expire.error?.code).toBe("42501");
  });
});
