import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// "Your payment didn't go through": a ticket payment that failed after the
// buyer left the payment screen is told to them once, and not when they
// have since got tickets for the event another way.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { notifyPaymentDidNotGoThrough } from "../payments/paymentFailedNotice";
import {
  type TestEventFixture,
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("payment didn't go through notice", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  const fixtures: TestEventFixture[] = [];

  beforeAll(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    buyer = await createTestUser(service);
  });

  afterAll(async () => {
    await service.from("notification").delete().eq("user_id", buyer.id);
    await service.from("ticket").delete().eq("user_id", buyer.id);
    await service.from("payment_attempt").delete().eq("user_id", buyer.id);
    for (const f of fixtures) {
      await deleteTestEvent(service, f.eventId).catch(() => undefined);
    }
    await Promise.all(
      [organizer, buyer].map((u) => deleteTestUser(service, u.id)),
    );
  });

  // One event per order: a buyer holds one open checkout per event.
  async function order(): Promise<{
    sessionId: string;
    fixture: TestEventFixture;
  }> {
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 50,
    });
    fixtures.push(fixture);
    const opened = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId: fixture.eventId,
      quantities: { [fixture.ticketTypeId]: 1 },
    });
    expect(opened.status, opened.message).toBe(200);
    return { sessionId: opened.checkoutSessionId as string, fixture };
  }

  async function attempt(
    sessionId: string,
    status: "failed" | "pending",
  ): Promise<string> {
    const { data, error } = await service
      .from("payment_attempt")
      .insert({
        user_id: buyer.id,
        checkout_session_id: sessionId,
        amount: 52.5,
        credit_amount: 0,
        currency: "GHS",
        country_code: "GH",
        provider: "paystack",
        provider_reference: `PFN-${crypto.randomUUID()}`,
        status,
        failure_reason: status === "failed" ? "timed out" : null,
        metadata: {
          mode: "direct",
          method: "mobile_money",
          charge_minor: 5250,
        },
        created_at: new Date(Date.now() - 40 * 60_000).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data?.id as string;
  }

  async function noticesFor(eventId: string) {
    const { data } = await service
      .from("notification")
      .select("type, link, data")
      .eq("user_id", buyer.id)
      .eq("type", "payment_failed");
    return (data ?? []).filter(
      (n) => (n.data as { eventId?: string } | null)?.eventId === eventId,
    );
  }

  it("tells the buyer once, with the event and what they were asked to pay", async () => {
    const { sessionId, fixture } = await order();
    const id = await attempt(sessionId, "failed");

    expect(await notifyPaymentDidNotGoThrough(id)).toBe("sent");
    expect(await notifyPaymentDidNotGoThrough(id)).toBe("skipped");

    const notices = await noticesFor(fixture.eventId);
    expect(notices).toHaveLength(1);
    const data = notices[0].data as {
      kind: string;
      notice: { id: string; params: Record<string, unknown> };
    };
    expect(data.kind).toBe("event");
    expect(data.notice.id).toBe("payment_not_through");
    expect(data.notice.params.amountMinor).toBe(5250);
    expect(data.notice.params.currency).toBe("GHS");
    expect(notices[0].link).toMatch(/^\/events\/[a-z0-9]+$/);
  });

  it("says nothing for a payment that has not failed", async () => {
    const { sessionId, fixture } = await order();
    const id = await attempt(sessionId, "pending");
    expect(await notifyPaymentDidNotGoThrough(id)).toBe("skipped");
    expect(await noticesFor(fixture.eventId)).toHaveLength(0);
  });

  it("says nothing when the buyer has since got tickets for the event", async () => {
    const { sessionId, fixture } = await order();
    const id = await attempt(sessionId, "failed");
    const { error } = await service.from("ticket").insert({
      user_id: buyer.id,
      ticket_type_id: fixture.ticketTypeId,
      status: "active",
      qr_public_id: "test/qr",
      qr_version: "1",
      ticket_code: `PFN-${crypto.randomUUID().slice(0, 8)}`,
      expires_at: new Date(Date.now() + 90_000_000).toISOString(),
    });
    expect(error).toBeNull();

    expect(await notifyPaymentDidNotGoThrough(id)).toBe("skipped");
    expect(await noticesFor(fixture.eventId)).toHaveLength(0);
  });
});
