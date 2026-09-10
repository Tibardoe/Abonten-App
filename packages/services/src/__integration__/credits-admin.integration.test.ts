import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// The admin credit operations through the real service layer
// (rewardsAdminCore): permission checks, maker-checker above the threshold,
// the goodwill cap, and the audit trail.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  approveCreditAdjustmentCore,
  getCreditAccountDetailCore,
  grantGoodwillCreditCore,
  requestCreditAdjustmentCore,
  setCreditAccountStatusCore,
} from "../admin/rewards/rewardsAdminCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

function adminCtx(
  userId: string,
  permissions: AdminContext["permissions"],
): AdminContext {
  return {
    userId,
    email: null,
    roles: ["finance_admin"],
    permissions,
    reauthenticatedAt: Date.now(),
  };
}

describe("admin credit operations", () => {
  let service: SupabaseClient<Database>;
  let customer: TestUser;
  let maker: TestUser;
  let checker: TestUser;

  beforeAll(async () => {
    service = getServiceClient();
    [customer, maker, checker] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
  });

  afterAll(async () => {
    await Promise.all(
      [customer, maker, checker].map((u) => deleteTestUser(service, u.id)),
    );
  });

  const svc = () => service as unknown as ServiceRoleClient;

  it("refuses without the right permission", async () => {
    const res = await requestCreditAdjustmentCore(
      svc(),
      adminCtx(maker.id, ["rewards.view"]),
      {
        userId: customer.id,
        direction: "credit",
        amountMinor: 500,
        reason: "No permission",
      },
    );
    expect(res.status).toBe(403);
  });

  it("applies a small adjustment straight away and records it", async () => {
    const res = await requestCreditAdjustmentCore(
      svc(),
      adminCtx(maker.id, ["finance.adjust", "rewards.view"]),
      {
        userId: customer.id,
        direction: "credit",
        amountMinor: 2000,
        reason: "Small fix",
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.executed).toBe(true);

    const { data: audit } = await service
      .from("admin_audit_log")
      .select("action")
      .eq("target_id", customer.id)
      .eq("action", "rewards.adjustment.request");
    expect((audit ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("holds a large adjustment for a second admin and refuses self-approval", async () => {
    const makerCtx = adminCtx(maker.id, ["finance.adjust", "rewards.view"]);
    const res = await requestCreditAdjustmentCore(svc(), makerCtx, {
      userId: customer.id,
      direction: "credit",
      amountMinor: 60000,
      reason: "Large compensation",
    });
    expect(res.status).toBe(202);
    const requestId = res.data?.requestId as string;

    const self = await approveCreditAdjustmentCore(svc(), makerCtx, {
      requestId,
    });
    expect(self.status).toBe(403);

    const other = await approveCreditAdjustmentCore(
      svc(),
      adminCtx(checker.id, ["finance.adjust", "rewards.view"]),
      { requestId, note: "Checked the ticket" },
    );
    expect(other.status).toBe(200);

    const detail = await getCreditAccountDetailCore(
      svc(),
      adminCtx(checker.id, ["rewards.view"]),
      customer.id,
    );
    expect(detail.data?.account.availableMinor).toBe(62000);
    expect(
      detail.data?.adjustments.find((a) => a.id === requestId)?.status,
    ).toBe("executed");
  });

  it("caps goodwill per user per month and is idempotent per request", async () => {
    const ctx = adminCtx(maker.id, ["rewards.goodwill", "rewards.view"]);
    const requestId = crypto.randomUUID();
    const first = await grantGoodwillCreditCore(svc(), ctx, {
      userId: customer.id,
      amountMinor: 3000,
      reason: "Late refund",
      requestId,
    });
    expect(first.status).toBe(200);

    const doubleSubmit = await grantGoodwillCreditCore(svc(), ctx, {
      userId: customer.id,
      amountMinor: 3000,
      reason: "Late refund",
      requestId,
    });
    expect(doubleSubmit.status).toBe(200);
    expect(doubleSubmit.data?.journalId).toBe(first.data?.journalId);

    const overCap = await grantGoodwillCreditCore(svc(), ctx, {
      userId: customer.id,
      amountMinor: 3000,
      reason: "Again",
      requestId: crypto.randomUUID(),
    });
    expect(overCap.status).toBe(409);
  });

  it("freezes and unfreezes with an audited reason", async () => {
    const ctx = adminCtx(maker.id, ["rewards.freeze"]);
    const frozen = await setCreditAccountStatusCore(svc(), ctx, {
      userId: customer.id,
      status: "frozen",
      reason: "Suspicious referrals",
    });
    expect(frozen.status).toBe(200);
    const { data } = await customer.client.rpc("get_my_credit_summary");
    expect((data as { status: string }).status).toBe("frozen");

    const active = await setCreditAccountStatusCore(svc(), ctx, {
      userId: customer.id,
      status: "active",
      reason: "Reviewed, fine",
    });
    expect(active.data?.previous).toBe("frozen");
  });
});
