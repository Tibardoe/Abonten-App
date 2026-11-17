import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Migration 20261117150029_card_check_refunds: a charge with no order (the
// small charge made to save a card, or a payment taken after its order
// closed) whose refund the provider refused, or that was never sent, is
// listed for the payment-reconcile sweep to ask again, paced, at most ten
// times; after that the dispatcher opens one incident.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const INCIDENT = "fin_reconciliation.orphan_refunds_refused";

describe("charges with no order: refund retry", () => {
  let service: SupabaseClient<Database>;
  let buyer: TestUser;
  const references: string[] = [];

  const ago = (minutes: number) =>
    new Date(Date.now() - minutes * 60_000).toISOString();

  beforeAll(async () => {
    service = getServiceClient();
    buyer = await createTestUser(service);
  });

  afterAll(async () => {
    await service
      .from("payment_orphan_capture")
      .delete()
      .in("provider_reference", references);
    await service.from("incident").delete().eq("component", INCIDENT);
    await deleteTestUser(service, buyer.id);
  });

  async function charge(
    status: "detected" | "refund_failed" | "refund_requested" | "refunded",
    {
      touchedMinutesAgo = 45,
      detectedMinutesAgo = 60,
      attempts = 1,
      source = "card_verification",
    }: {
      touchedMinutesAgo?: number;
      detectedMinutesAgo?: number;
      attempts?: number;
      source?: "card_verification" | "webhook";
    } = {},
  ): Promise<string> {
    const reference = `PSKCARD-${crypto.randomUUID()}`;
    references.push(reference);
    const { error } = await service.from("payment_orphan_capture").insert({
      provider: "paystack",
      country_code: "GH",
      provider_reference: reference,
      user_id: buyer.id,
      amount: 1,
      currency: "GHS",
      source,
      status,
      attempts,
      note: "Card check when saving a card",
      detected_at: ago(detectedMinutesAgo),
      updated_at: ago(touchedMinutesAgo),
    });
    expect(error).toBeNull();
    return reference;
  }

  async function candidates(): Promise<Set<string>> {
    const { data, error } = await service.rpc(
      "orphan_refund_retry_candidates",
      { p_limit: 25 },
    );
    expect(error).toBeNull();
    return new Set(
      ((data ?? []) as { provider_reference: string }[]).map(
        (r) => r.provider_reference,
      ),
    );
  }

  it("accepts a card check as a charge with no order", async () => {
    await charge("refund_requested");
  });

  it("lists a refused refund and one never sent, once 30 minutes have passed", async () => {
    const refused = await charge("refund_failed");
    const neverSent = await charge("detected");
    const justRefused = await charge("refund_failed", { touchedMinutesAgo: 5 });
    const listed = await candidates();
    expect(listed.has(refused)).toBe(true);
    expect(listed.has(neverSent)).toBe(true);
    expect(listed.has(justRefused)).toBe(false);
  });

  it("leaves refunds under way, done, too old or tried ten times", async () => {
    const underWay = await charge("refund_requested");
    const done = await charge("refunded");
    const tooOld = await charge("refund_failed", {
      detectedMinutesAgo: 15 * 24 * 60,
    });
    const tenTimes = await charge("refund_failed", { attempts: 10 });
    const listed = await candidates();
    for (const r of [underWay, done, tooOld, tenTimes]) {
      expect(listed.has(r)).toBe(false);
    }
  });

  it("covers late captures as well as card checks", async () => {
    const late = await charge("refund_failed", { source: "webhook" });
    expect((await candidates()).has(late)).toBe(true);
  });

  it("stops after ten refusals and opens one incident", async () => {
    await service.from("incident").delete().eq("component", INCIDENT);
    await charge("refund_failed", { attempts: 10 });
    expect(
      (await service.rpc("run_payment_reconcile_dispatch")).error,
    ).toBeNull();
    expect(
      (await service.rpc("run_payment_reconcile_dispatch")).error,
    ).toBeNull();
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
    const { error } = await buyer.client.rpc("orphan_refund_retry_candidates", {
      p_limit: 1,
    });
    expect(error).not.toBeNull();
  });
});
