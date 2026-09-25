import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Migration 20260913200200_refund_claim_and_event_reminders:
//  - claim_transaction_refund: one refund request per transaction at a
//    time (the second caller gets false), a failed attempt frees up after
//    two minutes.
//  - event_reminders_enqueue: "Tomorrow: <event>" for active ticket
//    holders of a session 23-25 hours away, once per person per session,
//    queued as an app push, skipping people with their own app reminder.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("refund claim", () => {
  let service: SupabaseClient<Database>;
  let buyer: TestUser;
  let transactionId: string;

  beforeAll(async () => {
    service = getServiceClient();
    buyer = await createTestUser(service);
    const { data, error } = await service
      .from("transaction")
      .insert({
        user_id: buyer.id,
        full_name: "Buyer",
        email: buyer.email,
        reason: "Ticket_Purchase",
        amount: 20,
        currency: "GHS",
        status: "successful",
        payment_method: "paystack",
        provider: "paystack",
        provider_reference: `CLM-${crypto.randomUUID()}`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    transactionId = data?.id as string;
  });

  afterAll(async () => {
    await service.from("transaction").delete().eq("id", transactionId);
    await deleteTestUser(service, buyer.id);
  });

  async function claim(): Promise<boolean> {
    const { data, error } = await service.rpc("claim_transaction_refund", {
      p_transaction_id: transactionId,
    });
    expect(error).toBeNull();
    return Boolean(data);
  }

  it("only one of two concurrent claimants wins", async () => {
    const results = await Promise.all([claim(), claim(), claim()]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("frees up when released, or two minutes after a stale claim", async () => {
    expect(await claim()).toBe(false);
    const { error } = await service.rpc("release_transaction_refund_claim", {
      p_transaction_id: transactionId,
    });
    expect(error).toBeNull();
    expect(await claim()).toBe(true);
    expect(await claim()).toBe(false);
    await service
      .from("transaction")
      .update({
        refund_claimed_at: new Date(Date.now() - 3 * 60_000).toISOString(),
      })
      .eq("id", transactionId);
    expect(await claim()).toBe(true);
    // The "a refund was attempted" stamp is set once and kept.
    const { data } = await service
      .from("transaction")
      .select("refund_requested_at")
      .eq("id", transactionId)
      .single();
    expect(data?.refund_requested_at).not.toBeNull();
  });

  it("never claims a transaction that is not refundable", async () => {
    await service
      .from("transaction")
      .update({ status: "refund_pending", refund_claimed_at: null })
      .eq("id", transactionId);
    expect(await claim()).toBe(false);
    // Buyers cannot call it at all (service role only).
    const { error } = await buyer.client.rpc("claim_transaction_refund", {
      p_transaction_id: transactionId,
    });
    expect(error).not.toBeNull();
  });
});

describe("event reminders", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let holder: TestUser;
  let selfReminded: TestUser;
  let eventId: string;
  let ticketTypeId: string;
  const ticketIds: string[] = [];

  async function issueTicket(userId: string) {
    const { data, error } = await service
      .from("ticket")
      .insert({
        user_id: userId,
        ticket_type_id: ticketTypeId,
        status: "active",
        qr_public_id: "test/qr",
        qr_version: "1",
        ticket_code: `R-${crypto.randomUUID().slice(0, 8)}`,
        expires_at: new Date(Date.now() + 90_000_000).toISOString(),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    ticketIds.push(data?.id as string);
  }

  async function run(): Promise<number> {
    const { data, error } = await service.rpc("event_reminders_enqueue");
    expect(error).toBeNull();
    return Number(data);
  }

  async function remindersFor(userId: string) {
    const { data } = await service
      .from("notification")
      .select("id, type, title, body, data")
      .eq("user_id", userId)
      .eq("type", "event_reminder");
    return data ?? [];
  }

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, holder, selfReminded] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
    // The fixture starts the event exactly 24 h from now: inside the
    // 23-25 h window the job looks at.
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
    });
    eventId = fixture.eventId;
    ticketTypeId = fixture.ticketTypeId;
    await issueTicket(holder.id);
    await issueTicket(selfReminded.id);
    // This person set their own reminder in the app.
    const { error } = await service
      .from("event_reminder")
      .insert({ user_id: selfReminded.id, event_id: eventId, offsets: [1440] });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    if (ticketIds.length > 0) {
      await service.from("ticket").delete().in("id", ticketIds);
    }
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, organizer.id);
    await deleteTestUser(service, holder.id);
    await deleteTestUser(service, selfReminded.id);
  });

  it("writes one reminder per person per session and queues it as a push", async () => {
    // Other suites leave events starting "tomorrow" behind on the shared
    // stack, so only this suite's holder is asserted exactly.
    expect(await run()).toBeGreaterThanOrEqual(1);

    const mine = await remindersFor(holder.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toMatch(/^Tomorrow: /);
    expect(mine[0].body).toMatch(/Starts /);
    expect((mine[0].data as { kind?: string }).kind).toBe("ticket");
    expect((mine[0].data as { eventId?: string }).eventId).toBe(eventId);

    const { data: delivery } = await service
      .from("notification_delivery")
      .select("channel, source, status, urgent")
      .eq("notification_id", mine[0].id)
      .maybeSingle();
    expect(delivery).toMatchObject({
      channel: "push",
      source: "app",
      status: "queued",
      urgent: false,
    });

    expect(await remindersFor(selfReminded.id)).toHaveLength(0);
  });

  it("never repeats a reminder", async () => {
    expect(await run()).toBe(0);
    expect(await remindersFor(holder.id)).toHaveLength(1);
  });

  it("leaves cancelled events alone", async () => {
    const other = await createTestUser(service);
    await issueTicket(other.id);
    await service
      .from("event")
      .update({ status: "canceled" })
      .eq("id", eventId);
    try {
      expect(await run()).toBe(0);
      expect(await remindersFor(other.id)).toHaveLength(0);
    } finally {
      await service
        .from("event")
        .update({ status: "published" })
        .eq("id", eventId);
      await deleteTestUser(service, other.id);
    }
  });
});
