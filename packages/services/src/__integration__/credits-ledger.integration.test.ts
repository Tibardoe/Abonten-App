import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Exercises the Abonten Credit ledger functions (migration
// 20260910193609_credits_ledger_core.sql) end to end against real Postgres:
// balances, lots, the pending -> available lifecycle, debt, expiry, account
// closure, and the reconciliation invariants after every step.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type Summary = {
  available_minor: number;
  pending_minor: number;
  in_debt: boolean;
  status: string;
};

async function summaryOf(user: TestUser): Promise<Summary> {
  const { data, error } = await user.client.rpc("get_my_credit_summary");
  if (error) throw new Error(error.message);
  return data as unknown as Summary;
}

async function expectLedgerHealthy(service: SupabaseClient<Database>) {
  const { data, error } = await service.rpc("credit_reconciliation_checks");
  expect(error).toBeNull();
  expect(data).toEqual({
    credit_unbalanced_journals: 0,
    credit_balance_cache_drift: 0,
    credit_lot_bucket_drift: 0,
    credit_lot_invalid_state: 0,
  });
}

const key = (label: string) => `test:${label}:${crypto.randomUUID()}`;

describe("credit ledger", () => {
  let service: SupabaseClient<Database>;
  let user: TestUser;

  beforeEach(async () => {
    service = getServiceClient();
    user = await createTestUser(service);
  });

  afterEach(async () => {
    await deleteTestUser(service, user.id);
  });

  it("grants available credit once per idempotency key", async () => {
    const k = key("bonus");
    const first = await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 1000,
      p_journal_type: "bonus.grant",
      p_lot_kind: "bonus",
      p_spend_scope: "any",
      p_idempotency_key: k,
      p_label: "Welcome bonus",
    });
    expect(first.error).toBeNull();
    expect(first.data?.[0]?.created).toBe(true);

    const replay = await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 1000,
      p_journal_type: "bonus.grant",
      p_lot_kind: "bonus",
      p_spend_scope: "any",
      p_idempotency_key: k,
    });
    expect(replay.error).toBeNull();
    expect(replay.data?.[0]?.created).toBe(false);
    expect(replay.data?.[0]?.journal_id).toBe(first.data?.[0]?.journal_id);

    const s = await summaryOf(user);
    expect(s.available_minor).toBe(1000);
    expect(s.pending_minor).toBe(0);
    await expectLedgerHealthy(service);
  });

  it("releases a pending reward pro rata and voids the rest", async () => {
    const accrued = await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 300,
      p_journal_type: "reward.accrue",
      p_lot_kind: "reward",
      p_spend_scope: "any",
      p_idempotency_key: key("accrue"),
      p_release_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(accrued.error).toBeNull();
    const lotId = accrued.data?.[0]?.lot_id as string;

    let s = await summaryOf(user);
    expect(s.pending_minor).toBe(300);
    expect(s.available_minor).toBe(0);

    const releaseKey = key("release");
    const released = await service.rpc("credit_release_lot", {
      p_lot_id: lotId,
      p_idempotency_key: releaseKey,
      p_release_minor: 200,
    });
    expect(released.error).toBeNull();
    expect(released.data?.[0]?.released_minor).toBe(200);

    // A replay of the same release is a no-op.
    const again = await service.rpc("credit_release_lot", {
      p_lot_id: lotId,
      p_idempotency_key: releaseKey,
      p_release_minor: 200,
    });
    expect(again.data?.[0]?.created).toBe(false);

    s = await summaryOf(user);
    expect(s.pending_minor).toBe(0);
    expect(s.available_minor).toBe(200);

    const { data: lot } = await service
      .from("credit_lot")
      .select("status, remaining_minor, released_minor")
      .eq("id", lotId)
      .single();
    expect(lot).toEqual({
      status: "active",
      remaining_minor: 200,
      released_minor: 200,
    });
    await expectLedgerHealthy(service);
  });

  it("voids a pending reward and refuses to release it afterwards", async () => {
    const accrued = await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 150,
      p_journal_type: "reward.accrue",
      p_lot_kind: "reward",
      p_spend_scope: "any",
      p_idempotency_key: key("accrue"),
    });
    const lotId = accrued.data?.[0]?.lot_id as string;

    const voided = await service.rpc("credit_void_lot", {
      p_lot_id: lotId,
      p_idempotency_key: key("void"),
    });
    expect(voided.error).toBeNull();

    const release = await service.rpc("credit_release_lot", {
      p_lot_id: lotId,
      p_idempotency_key: key("release"),
    });
    expect(release.error?.message).toMatch(/pending/);

    const s = await summaryOf(user);
    expect(s.pending_minor).toBe(0);
    expect(s.available_minor).toBe(0);
    await expectLedgerHealthy(service);
  });

  it("refuses a debit above the balance unless it may go negative, then repays debt from the next grant", async () => {
    await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 500,
      p_journal_type: "bonus.grant",
      p_lot_kind: "bonus",
      p_spend_scope: "any",
      p_idempotency_key: key("bonus"),
    });

    const refused = await service.rpc("credit_debit_available", {
      p_user_id: user.id,
      p_amount_minor: 800,
      p_journal_type: "adjust.debit",
      p_idempotency_key: key("debit"),
    });
    expect(refused.error?.message).toMatch(/Insufficient credit/);

    const clawback = await service.rpc("credit_debit_available", {
      p_user_id: user.id,
      p_amount_minor: 800,
      p_journal_type: "reward.clawback",
      p_idempotency_key: key("clawback"),
      p_allow_negative: true,
    });
    expect(clawback.error).toBeNull();
    expect(clawback.data?.[0]?.shortfall_minor).toBe(300);

    let s = await summaryOf(user);
    expect(s.available_minor).toBe(-300);
    expect(s.in_debt).toBe(true);

    // The next grant repays the 300 debt first; only 200 lands in the lot.
    const grant = await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 500,
      p_journal_type: "adjust.credit",
      p_lot_kind: "adjustment",
      p_spend_scope: "any",
      p_idempotency_key: key("adjust"),
    });
    const { data: lot } = await service
      .from("credit_lot")
      .select("remaining_minor")
      .eq("id", grant.data?.[0]?.lot_id as string)
      .single();
    expect(lot?.remaining_minor).toBe(200);

    s = await summaryOf(user);
    expect(s.available_minor).toBe(200);
    expect(s.in_debt).toBe(false);
    await expectLedgerHealthy(service);
  });

  it("spends non-withdrawable, soonest-expiring credit first", async () => {
    const soon = await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 100,
      p_journal_type: "bonus.grant",
      p_lot_kind: "bonus",
      p_spend_scope: "any",
      p_idempotency_key: key("soon"),
      p_expires_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    });
    const later = await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 100,
      p_journal_type: "bonus.grant",
      p_lot_kind: "bonus",
      p_spend_scope: "any",
      p_idempotency_key: key("later"),
      p_expires_at: new Date(Date.now() + 60 * 86_400_000).toISOString(),
    });

    await service.rpc("credit_debit_available", {
      p_user_id: user.id,
      p_amount_minor: 150,
      p_journal_type: "adjust.debit",
      p_idempotency_key: key("debit"),
    });

    const { data: lots } = await service
      .from("credit_lot")
      .select("id, remaining_minor, status")
      .in("id", [
        soon.data?.[0]?.lot_id as string,
        later.data?.[0]?.lot_id as string,
      ]);
    const byId = new Map((lots ?? []).map((l) => [l.id, l]));
    expect(byId.get(soon.data?.[0]?.lot_id as string)).toMatchObject({
      remaining_minor: 0,
      status: "exhausted",
    });
    expect(byId.get(later.data?.[0]?.lot_id as string)).toMatchObject({
      remaining_minor: 50,
      status: "active",
    });
    await expectLedgerHealthy(service);
  });

  it("expires overdue credit to breakage, exactly once", async () => {
    await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 400,
      p_journal_type: "bonus.grant",
      p_lot_kind: "bonus",
      p_spend_scope: "any",
      p_idempotency_key: key("expiring"),
      p_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });

    const first = await service.rpc("credit_expire_due_lots", {
      p_limit: 1000,
    });
    expect(first.error).toBeNull();
    expect(first.data).toBeGreaterThanOrEqual(1);

    const s = await summaryOf(user);
    expect(s.available_minor).toBe(0);

    const { data: activity } = await user.client.rpc(
      "get_my_credit_activity",
      {},
    );
    const types = (activity ?? []).map((a) => a.journal_type);
    expect(types).toContain("expire");
    expect(types).toContain("bonus.grant");
    await expectLedgerHealthy(service);
  });

  it("closes an account: voids pending, forfeits the balance, and blocks further grants", async () => {
    await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 250,
      p_journal_type: "bonus.grant",
      p_lot_kind: "bonus",
      p_spend_scope: "any",
      p_idempotency_key: key("bonus"),
    });
    await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 90,
      p_journal_type: "reward.accrue",
      p_lot_kind: "reward",
      p_spend_scope: "any",
      p_idempotency_key: key("accrue"),
    });

    expect(
      (await service.rpc("credit_close_account", { p_user_id: user.id })).error,
    ).toBeNull();
    // Idempotent.
    expect(
      (await service.rpc("credit_close_account", { p_user_id: user.id })).error,
    ).toBeNull();

    const s = await summaryOf(user);
    expect(s).toMatchObject({
      status: "closed",
      available_minor: 0,
      pending_minor: 0,
    });

    const blocked = await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 10,
      p_journal_type: "bonus.grant",
      p_lot_kind: "bonus",
      p_spend_scope: "any",
      p_idempotency_key: key("after-close"),
    });
    expect(blocked.error?.message).toMatch(/closed/);
    await expectLedgerHealthy(service);
  });
});
