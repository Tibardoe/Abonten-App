import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Proves under real concurrent load (not just by reading the SQL) that the
// credit ledger can't double-spend and can't double-grant: every posting
// locks the user's credit_account row and re-checks its idempotency key
// under that lock.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("credit ledger concurrency", () => {
  let service: SupabaseClient<Database>;
  let user: TestUser;

  beforeEach(async () => {
    service = getServiceClient();
    user = await createTestUser(service);
  });

  afterEach(async () => {
    await deleteTestUser(service, user.id);
  });

  it("20 parallel debits against a balance that covers 5 give exactly 5 successes and never go negative", async () => {
    await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: 500,
      p_journal_type: "bonus.grant",
      p_lot_kind: "bonus",
      p_spend_scope: "any",
      p_idempotency_key: `conc:grant:${crypto.randomUUID()}`,
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        service.rpc("credit_debit_available", {
          p_user_id: user.id,
          p_amount_minor: 100,
          p_journal_type: "adjust.debit",
          p_idempotency_key: `conc:debit:${crypto.randomUUID()}`,
        }),
      ),
    );

    const succeeded = results.filter((r) => !r.error);
    const refused = results.filter((r) => r.error);
    expect(succeeded).toHaveLength(5);
    expect(
      refused.every((r) => /Insufficient credit/.test(r.error?.message ?? "")),
    ).toBe(true);

    const { data: account } = await service
      .from("credit_account")
      .select("available_minor")
      .eq("user_id", user.id)
      .single();
    expect(account?.available_minor).toBe(0);
  });

  it("10 parallel grants with the same idempotency key post exactly once", async () => {
    const k = `conc:same-key:${crypto.randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        service.rpc("credit_grant", {
          p_user_id: user.id,
          p_amount_minor: 300,
          p_journal_type: "bonus.grant",
          p_lot_kind: "bonus",
          p_spend_scope: "any",
          p_idempotency_key: k,
        }),
      ),
    );

    expect(results.every((r) => !r.error)).toBe(true);
    expect(results.filter((r) => r.data?.[0]?.created === true)).toHaveLength(
      1,
    );
    const journalIds = new Set(results.map((r) => r.data?.[0]?.journal_id));
    expect(journalIds.size).toBe(1);

    const { data: account } = await service
      .from("credit_account")
      .select("available_minor, lifetime_earned_minor")
      .eq("user_id", user.id)
      .single();
    expect(account).toEqual({
      available_minor: 300,
      lifetime_earned_minor: 300,
    });

    const { data: recon } = await service.rpc("credit_reconciliation_checks");
    expect(recon).toMatchObject({
      credit_unbalanced_journals: 0,
      credit_balance_cache_drift: 0,
      credit_lot_bucket_drift: 0,
    });
  });
});
