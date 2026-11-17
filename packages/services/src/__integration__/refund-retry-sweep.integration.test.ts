import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Migration 20261116230148_refund_retry_sweep: refund_retry_candidates()
// lists cash payments that still owe a refund (a cancelled ticket no live
// refund part covers), with its pacing guards, and the reconcile
// dispatcher opens one incident when the provider has refused five times.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const INCIDENT = "fin_reconciliation.refunds_refused";

describe("refund retry sweep", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let eventId: string;
  let ticketTypeId: string;
  const transactionIds: string[] = [];

  const ago = (minutes: number) =>
    new Date(Date.now() - minutes * 60_000).toISOString();

  async function payment(
    extra: Partial<Database["public"]["Tables"]["transaction"]["Insert"]> = {},
  ): Promise<string> {
    const { data, error } = await service
      .from("transaction")
      .insert({
        user_id: buyer.id,
        full_name: "Buyer",
        email: buyer.email,
        reason: "Ticket_Purchase",
        amount: 42,
        currency: "GHS",
        status: "successful",
        payment_method: "paystack",
        provider: "paystack",
        provider_reference: `RTY-${crypto.randomUUID()}`,
        ...extra,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    transactionIds.push(data?.id as string);
    return data?.id as string;
  }

  async function ticket(
    transactionId: string,
    status: "active" | "cancelled",
    cancelledMinutesAgo = 60,
  ): Promise<string> {
    const { data, error } = await service
      .from("ticket")
      .insert({
        user_id: buyer.id,
        ticket_type_id: ticketTypeId,
        transaction_id: transactionId,
        status,
        qr_public_id: "test/qr",
        qr_version: "1",
        ticket_code: `RTY-${crypto.randomUUID().slice(0, 8)}`,
        expires_at: new Date(Date.now() + 90_000_000).toISOString(),
        updated_at: ago(cancelledMinutesAgo),
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    return data?.id as string;
  }

  async function part(
    transactionId: string,
    status: "failed" | "requested",
    createdMinutesAgo: number,
    ticketIds: string[] = [],
  ) {
    const { data, error } = await service
      .from("transaction_refund")
      .insert({
        transaction_id: transactionId,
        user_id: buyer.id,
        currency: "GHS",
        amount: 40,
        status,
        created_at: ago(createdMinutesAgo),
        failed_at: status === "failed" ? ago(createdMinutesAgo) : null,
        failure_detail:
          status === "failed"
            ? "The provider refused the refund request"
            : null,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (ticketIds.length > 0) {
      const { error: linkError } = await service
        .from("transaction_refund_ticket")
        .insert(
          ticketIds.map((t) => ({
            refund_id: data?.id as string,
            ticket_id: t,
          })),
        );
      expect(linkError).toBeNull();
    }
  }

  async function candidates(): Promise<Map<string, number>> {
    const { data, error } = await service.rpc("refund_retry_candidates", {
      p_limit: 25,
    });
    expect(error).toBeNull();
    return new Map(
      (data ?? [])
        .filter((r) => transactionIds.includes(r.transaction_id))
        .map((r) => [r.transaction_id, r.failed_parts]),
    );
  }

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, buyer] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 20,
    });
    eventId = fixture.eventId;
    ticketTypeId = fixture.ticketTypeId;
  });

  afterAll(async () => {
    await service.from("incident").delete().eq("component", INCIDENT);
    if (transactionIds.length > 0) {
      await service
        .from("ticket")
        .delete()
        .in("transaction_id", transactionIds);
      await service.from("transaction").delete().in("id", transactionIds);
    }
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, buyer.id);
    await deleteTestUser(service, organizer.id);
  });

  it("lists a payment whose cancelled ticket no refund covers", async () => {
    const owed = await payment();
    await ticket(owed, "cancelled");
    await ticket(owed, "active");
    expect((await candidates()).get(owed)).toBe(0);
  });

  it("leaves a ticket cancelled minutes ago to the request that cancelled it", async () => {
    const fresh = await payment();
    await ticket(fresh, "cancelled", 5);
    expect((await candidates()).has(fresh)).toBe(false);
  });

  it("leaves a cancellation older than two weeks to a person", async () => {
    const old = await payment();
    await ticket(old, "cancelled", 15 * 24 * 60);
    expect((await candidates()).has(old)).toBe(false);
  });

  it("asks again after a refused part, but not within 30 minutes of it", async () => {
    const refused = await payment();
    const t = await ticket(refused, "cancelled");
    await part(refused, "failed", 10, [t]);
    expect((await candidates()).has(refused)).toBe(false);
    await service
      .from("transaction_refund")
      .update({ created_at: ago(45) })
      .eq("transaction_id", refused);
    expect((await candidates()).get(refused)).toBe(1);
  });

  it("skips tickets a live refund part already covers", async () => {
    const covered = await payment();
    const t = await ticket(covered, "cancelled");
    await part(covered, "requested", 60, [t]);
    expect((await candidates()).has(covered)).toBe(false);
  });

  it("skips credit, Pay small small and payments not successful", async () => {
    const credit = await payment({ credit_amount: 10 });
    await ticket(credit, "cancelled");
    const plan = await payment({ provider: "abonten_plan" });
    await ticket(plan, "cancelled");
    const pending = await payment({ status: "refund_pending" });
    await ticket(pending, "cancelled");
    const listed = await candidates();
    expect(listed.has(credit)).toBe(false);
    expect(listed.has(plan)).toBe(false);
    expect(listed.has(pending)).toBe(false);
  });

  it("stops after five refusals and opens one incident", async () => {
    await service.from("incident").delete().eq("component", INCIDENT);
    const stuck = await payment();
    const t = await ticket(stuck, "cancelled");
    for (let i = 0; i < 5; i += 1) await part(stuck, "failed", 60 + i, [t]);
    expect((await candidates()).has(stuck)).toBe(false);

    const { error } = await service.rpc("run_payment_reconcile_dispatch");
    expect(error).toBeNull();
    const { error: againError } = await service.rpc(
      "run_payment_reconcile_dispatch",
    );
    expect(againError).toBeNull();
    const { data: incidents } = await service
      .from("incident")
      .select("id, status, severity")
      .eq("component", INCIDENT);
    expect(incidents).toHaveLength(1);
    expect(incidents?.[0]).toMatchObject({
      status: "investigating",
      severity: "high",
    });
  });

  it("is refused to a signed-in person", async () => {
    const { error } = await buyer.client.rpc("refund_retry_candidates", {
      p_limit: 1,
    });
    expect(error).not.toBeNull();
  });
});
