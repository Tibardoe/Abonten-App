import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listCommissionsAdminCore } from "../admin/fieldOps/commissionsAdminCore";
import { getFieldOpsOverviewCore } from "../admin/fieldOps/overviewAdminCore";
import { listRefundsCore } from "../admin/finance/financeAdminCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Two reads that used to be done row by row in JavaScript now happen in one
// SQL call each. The point of these tests is not the arithmetic — that stays
// in the functions they wrap — but that the batched answer is the same as
// the per-row one, that a page of refunds costs one call, and that neither
// function is reachable by a signed-in user.

const service = getServiceClient() as unknown as ServiceRoleClient;

const ctxFor = (userId: string): AdminContext => ({
  userId,
  email: null,
  roles: ["finance_admin"],
  permissions: ["finance.view", "fieldops.view"],
  reauthenticatedAt: Date.now(),
});

let person: TestUser;
let ctx: AdminContext;

beforeAll(async () => {
  person = await createTestUser(service);
  ctx = ctxFor(person.id);
});

afterAll(async () => {
  await deleteTestUser(service, person.id);
});

describe("admin_transaction_refundable_amounts", () => {
  it("gives every id the same amount as get_transaction_refundable_amount()", async () => {
    // Whatever transactions the other suites left behind; the parity holds
    // for any id, including ones with no tickets (0) and ones that do not
    // exist (0).
    const { data: rows } = await service
      .from("transaction")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(25);
    const ids = [...(rows ?? []).map((r) => r.id), crypto.randomUUID()];

    const batched = await service.rpc("admin_transaction_refundable_amounts", {
      p_transaction_ids: ids,
    });
    expect(batched.error).toBeNull();
    const byId = new Map(
      (batched.data ?? []).map((r) => [r.transaction_id, Number(r.refundable)]),
    );
    expect(byId.size).toBe(ids.length);

    for (const id of ids) {
      const single = await service.rpc("get_transaction_refundable_amount", {
        p_transaction_id: id,
      });
      expect(single.error).toBeNull();
      expect(byId.get(id)).toBe(Number(single.data ?? 0));
    }
  });

  it("returns nothing for an empty list and does not fail", async () => {
    const res = await service.rpc("admin_transaction_refundable_amounts", {
      p_transaction_ids: [],
    });
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });

  it("is what the refunds list reads", async () => {
    const res = await listRefundsCore(service, ctx, { status: "all" });
    expect(res.status).toBe(200);
    for (const item of res.data) {
      const single = await service.rpc("get_transaction_refundable_amount", {
        p_transaction_id: item.transactionId,
      });
      expect(item.refundableAmount).toBe(Number(single.data ?? 0));
    }
  });
});

describe("admin_fieldops_commission_totals", () => {
  it("matches a JavaScript sum of every row, per currency and status", async () => {
    const { data: all } = await service
      .from("fieldops_commission")
      .select("status, amount_minor, currency, campaign_id")
      .limit(100_000);
    const expected = new Map<string, Record<string, number>>();
    for (const r of all ?? []) {
      const bucket = expected.get(r.currency) ?? {};
      bucket[r.status] = (bucket[r.status] ?? 0) + Number(r.amount_minor);
      expected.set(r.currency, bucket);
    }

    const { data, error } = await service.rpc(
      "admin_fieldops_commission_totals",
      {},
    );
    expect(error).toBeNull();
    const rows = (data ?? []) as {
      currency: string;
      rows: number;
      pending: number;
      approved: number;
      in_payout: number;
      paid: number;
      rejected: number;
      reversed: number;
    }[];
    expect(rows.map((r) => r.currency).sort()).toEqual(
      [...expected.keys()].sort(),
    );
    for (const row of rows) {
      const want = expected.get(row.currency) ?? {};
      expect(Number(row.pending)).toBe(want.pending ?? 0);
      expect(Number(row.approved)).toBe(want.approved ?? 0);
      expect(Number(row.in_payout)).toBe(want.in_payout ?? 0);
      expect(Number(row.paid)).toBe(want.paid ?? 0);
      expect(Number(row.rejected)).toBe(want.rejected ?? 0);
      expect(Number(row.reversed)).toBe(want.reversed ?? 0);
    }

    // A campaign filter narrows the same way.
    const campaignId = all?.[0]?.campaign_id;
    if (campaignId) {
      const one = await service.rpc("admin_fieldops_commission_totals", {
        p_campaign_id: campaignId,
      });
      expect(one.error).toBeNull();
      const totalRows = ((one.data ?? []) as { rows: number }[]).reduce(
        (n, r) => n + Number(r.rows),
        0,
      );
      expect(totalRows).toBe(
        (all ?? []).filter((r) => r.campaign_id === campaignId).length,
      );
    }
  });

  it("feeds the overview and the commissions list", async () => {
    const overview = await getFieldOpsOverviewCore(service, ctx);
    expect(overview.status).toBe(200);
    const money = overview.data?.money;
    expect(money).toBeDefined();
    expect(typeof money?.currency).toBe("string");
    expect(Number.isFinite(money?.pendingMinor)).toBe(true);

    const list = await listCommissionsAdminCore(service, ctx, {});
    expect(list.status).toBe(200);
    expect(list.data?.currency).toBe(money?.currency);
    expect(list.data?.totals.pending).toBe(money?.pendingMinor);
    expect(list.data?.totals.paid).toBe(money?.paidMinor);
  });
});

describe("authorisation", () => {
  it("keeps both functions away from signed-in users", async () => {
    const refundable = await person.client.rpc(
      "admin_transaction_refundable_amounts",
      { p_transaction_ids: [crypto.randomUUID()] },
    );
    expect(refundable.error).not.toBeNull();

    const totals = await person.client.rpc(
      "admin_fieldops_commission_totals",
      {},
    );
    expect(totals.error).not.toBeNull();
  });
});
