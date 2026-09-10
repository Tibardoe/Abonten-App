import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// The security boundary of the Abonten Credit ledger: no client can create,
// move or read other people's credit, and even the backend service-role key
// can only move credit through the credit_* functions (the ledger tables
// are SELECT-only for it).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("credit ledger authorization", () => {
  let service: SupabaseClient<Database>;
  let alice: TestUser;
  let bob: TestUser;
  let anon: SupabaseClient<Database>;

  beforeAll(async () => {
    service = getServiceClient();
    alice = await createTestUser(service);
    bob = await createTestUser(service);
    anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    const granted = await service.rpc("credit_grant", {
      p_user_id: bob.id,
      p_amount_minor: 700,
      p_journal_type: "bonus.grant",
      p_lot_kind: "bonus",
      p_spend_scope: "any",
      p_idempotency_key: `authz:bob:${crypto.randomUUID()}`,
    });
    expect(granted.error).toBeNull();
  });

  afterAll(async () => {
    await deleteTestUser(service, alice.id);
    await deleteTestUser(service, bob.id);
  });

  it("a signed-in user cannot call any function that moves credit", async () => {
    const attempts = [
      alice.client.rpc("credit_grant", {
        p_user_id: alice.id,
        p_amount_minor: 100000,
        p_journal_type: "bonus.grant",
        p_lot_kind: "bonus",
        p_spend_scope: "any",
        p_idempotency_key: "self-grant",
      }),
      alice.client.rpc("credit_debit_available", {
        p_user_id: bob.id,
        p_amount_minor: 100,
        p_journal_type: "adjust.debit",
        p_idempotency_key: "steal",
      }),
      alice.client.rpc("credit_set_account_status", {
        p_user_id: bob.id,
        p_status: "frozen",
        p_reason: "nope",
      }),
      alice.client.rpc("credit_request_adjustment", {
        p_user_id: alice.id,
        p_direction: "credit",
        p_amount_minor: 100,
        p_reason: "self",
        p_requested_by: alice.id,
      }),
      alice.client.rpc("credit_grant_goodwill", {
        p_user_id: alice.id,
        p_amount_minor: 100,
        p_admin_id: alice.id,
        p_reason: "self",
        p_idempotency_key: "self-goodwill",
      }),
      alice.client.rpc("credit_expire_due_lots", {}),
      alice.client.rpc("admin_rewards_overview", {
        p_from: new Date(0).toISOString(),
        p_to: new Date().toISOString(),
      }),
    ];
    for (const res of await Promise.all(attempts)) {
      // 42501 = insufficient_privilege: refused, not merely "not found".
      expect(res.error?.code, res.error?.message).toBe("42501");
    }

    const { data } = await alice.client.rpc("get_my_credit_summary");
    expect((data as { available_minor: number }).available_minor).toBe(0);
  });

  it("a signed-in user cannot write any credit table directly", async () => {
    const writes = [
      alice.client.from("credit_account").insert({ user_id: alice.id }),
      alice.client
        .from("credit_account")
        .update({ available_minor: 999999 })
        .eq("user_id", bob.id),
      alice.client.from("credit_lot").insert({
        user_id: alice.id,
        kind: "bonus",
        spend_scope: "any",
        status: "active",
        funding_code: "campaign_expense",
        original_minor: 1000,
        remaining_minor: 1000,
      }),
      alice.client.from("credit_journal").insert({
        journal_type: "bonus.grant",
        idempotency_key: "forged",
        actor_type: "user",
      }),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.error?.code, res.error?.message).toBe("42501");
    }
  });

  it("a user sees only their own account and lots, and never the journal", async () => {
    const accounts = await alice.client
      .from("credit_account")
      .select("user_id")
      .eq("user_id", bob.id);
    expect(accounts.data ?? []).toHaveLength(0);

    const lots = await alice.client
      .from("credit_lot")
      .select("id")
      .eq("user_id", bob.id);
    expect(lots.data ?? []).toHaveLength(0);

    const bobsOwn = await bob.client
      .from("credit_account")
      .select("available_minor");
    expect(bobsOwn.data?.[0]?.available_minor).toBe(700);

    const journal = await bob.client.from("credit_journal").select("id");
    expect(journal.error !== null || (journal.data ?? []).length === 0).toBe(
      true,
    );

    // Alice's activity feed never includes Bob's lines.
    const { data: activity } = await alice.client.rpc(
      "get_my_credit_activity",
      {},
    );
    expect(activity ?? []).toHaveLength(0);
  });

  it("even the service-role key can only read the ledger tables", async () => {
    const { data: ledgerAccount } = await service
      .from("credit_ledger_account")
      .select("id")
      .eq("code", "breakage")
      .is("owner_user_id", null)
      .single();
    const forged = await service.from("credit_entry").insert({
      journal_id: crypto.randomUUID(),
      ledger_account_id: ledgerAccount?.id as string,
      amount_minor: 1,
    });
    expect(forged.error?.code).toBe("42501");

    const tamper = await service
      .from("credit_account")
      .update({ available_minor: 1 })
      .eq("user_id", bob.id);
    expect(tamper.error?.code).toBe("42501");
  });

  it("signed-out visitors can read the public program terms but not a balance", async () => {
    const program = await anon.rpc("get_rewards_program_public");
    expect(program.error).toBeNull();
    expect((program.data as { enabled: boolean }).enabled).toBe(false);

    const summary = await anon.rpc("get_my_credit_summary");
    expect(summary.error?.code).toBe("42501");
  });
});
