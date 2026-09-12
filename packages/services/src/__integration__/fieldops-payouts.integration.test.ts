import type {
  AdminContext,
  AdminPermissionKey,
} from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  setCampaignStatusCore,
  upsertCampaignCore,
} from "../admin/fieldOps/campaignsAdminCore";
import { reverseCommissionAdminCore } from "../admin/fieldOps/commissionsAdminCore";
import {
  approvePayoutBatchCore,
  buildPayoutBatchCore,
  cancelPayoutBatchCore,
  exportPayoutBatchCsvCore,
  getPayoutBatchCore,
  markPayoutItemCore,
  previewPayoutBatchCore,
} from "../admin/fieldOps/payoutsAdminCore";
import { upsertTerritoryCore } from "../admin/fieldOps/regionsAdminCore";
import { updateFieldOpsSettingsCore } from "../admin/fieldOps/settingsAdminCore";
import { addTeamMemberCore } from "../admin/fieldOps/teamAdminCore";
import { getMyEarningsCore } from "../fieldOps/member/earningsQuery";
import {
  getPayoutDestinationCore,
  setPayoutDestinationCore,
} from "../fieldOps/member/payoutDestinationCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Field Ops Phase 4: paying the team.
//
//   * a member sets their own MoMo destination; it is read back masked and
//     cannot be changed while a payment to the old number is in flight
//   * a batch gathers every approved commission per member and moves them
//     to in_payout; members with no destination are left out with their
//     money still ready to pay
//   * a SECOND admin must approve, enforced by the database
//   * marking an item paid pays its commissions and notifies the member;
//     marking one failed puts the money straight back in the pool
//   * cancelling a batch unwinds it completely
//   * the batch closes itself when nothing is pending
//   * the ledger and the payout items always agree (health + reconciliation)

const svc = getServiceClient() as ServiceRoleClient;

const adminCtx = (
  userId: string,
  extra: AdminPermissionKey[] = [],
): AdminContext => ({
  userId,
  email: null,
  roles: ["field_ops_manager"],
  permissions: [
    "fieldops.view",
    "fieldops.manage",
    "fieldops.rules",
    "fieldops.verify",
    "fieldops.commissions.approve",
    "fieldops.commissions.pay",
    ...extra,
  ],
  reauthenticatedAt: Date.now(),
});

let admin: TestUser;
let admin2: TestUser;
let lead: TestUser;
let memberA: TestUser;
let memberB: TestUser;
let regionId: string;
let campaignId: string;
let territoryId: string;
let memberAId: string;
let memberBId: string;
let teamId: string;
let ruleId: string;
let ruleVersion: number;

const uniq = String(Date.now()).slice(-8);

const patchSettings = async (
  patch: Parameters<typeof updateFieldOpsSettingsCore>[2]["patch"],
  reason: string,
) => {
  const { data: current } = await svc
    .from("fieldops_program_setting")
    .select("updated_at")
    .eq("id", 1)
    .single();
  const res = await updateFieldOpsSettingsCore(svc, adminCtx(admin.id), {
    patch,
    expectedUpdatedAt: current?.updated_at as string,
    reason,
  });
  if (res.status !== 200 && res.message !== "Nothing changed.") {
    throw new Error(`settings patch failed: ${res.message}`);
  }
};

/**
 * Phase 4 is about moving money that is already approved, so the earning
 * side is seeded directly rather than driven through the whole wizard --
 * fieldops-sweep already proves how a commission becomes `approved`. The
 * rule is still attached, because "nothing payable without a rule behind
 * it" is one of the invariants fieldops_health() watches.
 */
async function seedApprovedCommission(
  memberId: string,
  memberUserId: string,
  amountMinor: number,
): Promise<string> {
  const { data, error } = await svc
    .from("fieldops_commission")
    .insert({
      campaign_id: campaignId,
      team_id: teamId,
      member_id: memberId,
      member_user_id: memberUserId,
      period_start: new Date().toISOString().slice(0, 10),
      activity_key: "place_onboarding_offline",
      rule_id: ruleId,
      rule_version: ruleVersion,
      amount_minor: amountMinor,
      currency: "GHS",
      status: "approved",
      approved_at: new Date().toISOString(),
      idempotency_key: `test:${crypto.randomUUID()}`,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(`seed commission failed: ${error.message}`);
  return data?.id as string;
}

const commissionStatus = async (id: string) => {
  const { data } = await svc
    .from("fieldops_commission")
    .select("status, payout_item_id, paid_at")
    .eq("id", id)
    .single();
  return data as {
    status: string;
    payout_item_id: string | null;
    paid_at: string | null;
  };
};

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  [admin, admin2, lead, memberA, memberB] = await Promise.all([
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
  ]);

  await patchSettings(
    {
      programEnabled: true,
      commissionGenerationEnabled: true,
      payoutsEnabled: true,
      requireMemberPhoneVerified: false,
    },
    "integration test",
  );

  const ctx = adminCtx(admin.id);
  const { data: region } = await svc
    .from("fieldops_region")
    .insert({ name: `FieldOps payouts ${uniq}`, country_code: "GH" } as never)
    .select("id")
    .single();
  regionId = region?.id as string;
  const created = await upsertCampaignCore(svc, ctx, {
    regionId,
    name: "Payout campaign",
    currency: "GHS",
  });
  campaignId = created.data?.id as string;
  const t = await upsertTerritoryCore(svc, ctx, {
    regionId,
    name: "Ejisu",
    kind: "town",
    centre: { lat: 6.7208, lng: -1.3661 },
    radiusM: 4000,
  });
  territoryId = t.data?.id as string;

  await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "team_lead",
    userId: lead.id,
  });
  const a = await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "offline_member",
    userId: memberA.id,
  });
  memberAId = a.data?.id as string;
  const b = await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "online_member",
    userId: memberB.id,
  });
  memberBId = b.data?.id as string;
  const { data: team } = await svc
    .from("fieldops_team")
    .select("id")
    .eq("campaign_id", campaignId)
    .single();
  teamId = team?.id as string;

  // Any published rule version will do: the payout path never re-prices,
  // it only moves what the ledger already says is owed.
  const { data: rule } = await svc
    .from("fieldops_commission_rule")
    .select("id, version")
    .eq("activity_key", "place_onboarding_offline")
    .is("campaign_id", null)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  ruleId = rule?.id as string;
  ruleVersion = Number(rule?.version);

  const active = await setCampaignStatusCore(svc, ctx, {
    campaignId,
    action: "activate",
    reason: "t",
  });
  expect(active.status, active.message).toBe(200);
});

afterAll(async () => {
  // Commissions and payout rows are append-only by design, so they pin the
  // campaign behind them; the local stack is thrown away by test:db:down.
  await svc.from("fieldops_assignment").delete().eq("campaign_id", campaignId);
  await patchSettings(
    {
      programEnabled: false,
      payoutsEnabled: true,
      requireMemberPhoneVerified: true,
    },
    "cleanup",
  ).catch(() => undefined);
  await Promise.all(
    [admin, admin2, lead, memberA, memberB].map((u) =>
      deleteTestUser(svc, u.id),
    ),
  );
});

describe("the member's payout destination", () => {
  it("starts empty, saves, and reads back masked", async () => {
    const before = await getPayoutDestinationCore(svc, memberA.id, {
      campaignId,
    });
    expect(before.status, before.message).toBe(200);
    expect(before.data?.numberMasked).toBeNull();

    const saved = await setPayoutDestinationCore(svc, memberA.id, {
      campaignId,
      momoNumber: "0241234567",
      momoNetwork: "MTN",
      holderName: "Ama Mensah",
    });
    expect(saved.status, saved.message).toBe(200);
    // The full number never comes back out of the service.
    expect(saved.data?.numberMasked).not.toContain("1234567");
    expect(saved.data?.numberMasked).toContain("67");
    expect(saved.data?.network).toBe("MTN");
  });

  it("is refused for someone who is not on the campaign", async () => {
    const res = await setPayoutDestinationCore(svc, admin2.id, {
      campaignId,
      momoNumber: "0240000000",
      momoNetwork: "MTN",
      holderName: "Nobody",
    });
    expect(res.status).toBe(403);
  });

  it("is not readable by another member through the client", async () => {
    const { data } = await memberB.client
      .from("fieldops_team_member")
      .select("id")
      .eq("id", memberAId);
    // memberB can see the row exists only if they are the lead; either way
    // the payout columns are revoked at the column level, so selecting them
    // is an error rather than a leak.
    const { error } = await memberB.client
      .from("fieldops_team_member")
      .select("payout_momo_number")
      .eq("id", memberAId);
    expect(error).not.toBeNull();
    expect(data ?? []).toEqual([]);
  });
});

describe("building a batch", () => {
  let commissionA1: string;
  let commissionA2: string;
  let commissionB: string;
  let batchId: string;

  it("previews what would be paid and who is missing a number", async () => {
    commissionA1 = await seedApprovedCommission(memberAId, memberA.id, 500);
    commissionA2 = await seedApprovedCommission(memberAId, memberA.id, 500);
    commissionB = await seedApprovedCommission(memberBId, memberB.id, 700);

    const preview = await previewPayoutBatchCore(
      svc,
      adminCtx(admin.id),
      campaignId,
    );
    expect(preview.status, preview.message).toBe(200);
    // memberA has a destination, memberB does not yet.
    expect(preview.data?.lines.length).toBe(1);
    expect(preview.data?.lines[0].amountMinor).toBe(1000);
    expect(preview.data?.lines[0].commissionCount).toBe(2);
    expect(preview.data?.totalMinor).toBe(1000);
    expect(preview.data?.withoutDestination.length).toBe(1);
    expect(preview.data?.withoutDestination[0].amountMinor).toBe(700);
    expect(preview.data?.openBatchId).toBeNull();
  });

  it("groups per member and leaves out anyone without a destination", async () => {
    const built = await buildPayoutBatchCore(svc, adminCtx(admin.id), {
      campaignId,
      label: "Week 37",
      reason: "weekly run",
    });
    expect(built.status, built.message).toBe(200);
    batchId = built.data?.id as string;
    expect(built.data?.itemCount).toBe(1);
    expect(built.data?.totalMinor).toBe(1000);
    expect(built.data?.status).toBe("draft");

    // memberA's two commissions moved together; memberB's is untouched.
    expect((await commissionStatus(commissionA1)).status).toBe("in_payout");
    expect((await commissionStatus(commissionA2)).status).toBe("in_payout");
    expect((await commissionStatus(commissionB)).status).toBe("approved");
  });

  it("refuses a second open batch for the same campaign", async () => {
    const again = await buildPayoutBatchCore(svc, adminCtx(admin.id), {
      campaignId,
      label: "Week 37 again",
      reason: "duplicate",
    });
    expect(again.status).toBe(409);
  });

  it("will not let the admin who built it approve it", async () => {
    const own = await approvePayoutBatchCore(svc, adminCtx(admin.id), {
      batchId,
      reason: "self approval",
    });
    expect(own.status).toBe(400);
    expect(own.message).toMatch(/cannot approve/i);

    const detail = await getPayoutBatchCore(svc, adminCtx(admin.id), batchId);
    expect(detail.data?.canApprove).toBe(false);
    const asOther = await getPayoutBatchCore(svc, adminCtx(admin2.id), batchId);
    expect(asOther.data?.canApprove).toBe(true);
  });

  it("is approved by a different admin", async () => {
    const ok = await approvePayoutBatchCore(svc, adminCtx(admin2.id), {
      batchId,
      reason: "checked the list",
    });
    expect(ok.status, ok.message).toBe(200);
    expect(ok.data?.status).toBe("approved");
    expect(ok.data?.approvedBy).toBe(admin2.id);
  });

  it("hides the full MoMo number without users.view_pii", async () => {
    const plain = await getPayoutBatchCore(svc, adminCtx(admin.id), batchId);
    expect(plain.data?.items[0].destination.number).toBeNull();
    expect(plain.data?.items[0].destination.numberMasked).toBeTruthy();

    const withPii = await getPayoutBatchCore(
      svc,
      adminCtx(admin.id, ["users.view_pii"]),
      batchId,
    );
    expect(withPii.data?.items[0].destination.number).toBe("0241234567");
  });

  it("refuses a destination change while the payment is in flight", async () => {
    const res = await setPayoutDestinationCore(svc, memberA.id, {
      campaignId,
      momoNumber: "0559999999",
      momoNetwork: "Telecel",
      holderName: "Ama Mensah",
    });
    expect(res.status).toBe(409);
  });

  it("pays an item, pays its commissions and closes the batch", async () => {
    const detail = await getPayoutBatchCore(svc, adminCtx(admin.id), batchId);
    const itemId = detail.data?.items[0].id as string;

    const noRef = await markPayoutItemCore(svc, adminCtx(admin.id), {
      itemId,
      status: "paid",
      reference: "",
    });
    expect(noRef.status).toBe(400);

    const paid = await markPayoutItemCore(svc, adminCtx(admin.id), {
      itemId,
      status: "paid",
      reference: "MM-77841",
    });
    expect(paid.status, paid.message).toBe(200);
    expect((await commissionStatus(commissionA1)).status).toBe("paid");
    expect((await commissionStatus(commissionA2)).status).toBe("paid");

    // Nothing left pending, so the batch closed itself.
    const after = await getPayoutBatchCore(svc, adminCtx(admin.id), batchId);
    expect(after.data?.batch.status).toBe("paid");

    const { data: notice } = await svc
      .from("notification")
      .select("type")
      .eq("user_id", memberA.id)
      .eq("type", "fieldops_commission_paid")
      .maybeSingle();
    expect(notice?.type).toBe("fieldops_commission_paid");
  });

  it("refuses to pay the same item twice", async () => {
    const detail = await getPayoutBatchCore(svc, adminCtx(admin.id), batchId);
    const itemId = detail.data?.items[0].id as string;
    const again = await markPayoutItemCore(svc, adminCtx(admin.id), {
      itemId,
      status: "paid",
      reference: "MM-77841",
    });
    expect(again.status).toBe(400);
  });
});

describe("when a transfer fails", () => {
  it("puts the money straight back into the pool", async () => {
    // memberB now has a destination, so the next batch picks them up.
    const dest = await setPayoutDestinationCore(svc, memberB.id, {
      campaignId,
      momoNumber: "0209876543",
      momoNetwork: "AirtelTigo",
      holderName: "Kofi Boateng",
    });
    expect(dest.status, dest.message).toBe(200);

    const built = await buildPayoutBatchCore(svc, adminCtx(admin.id), {
      campaignId,
      label: "Week 38",
      reason: "weekly run",
    });
    expect(built.status, built.message).toBe(200);
    const batchId = built.data?.id as string;
    expect(built.data?.totalMinor).toBe(700);

    await approvePayoutBatchCore(svc, adminCtx(admin2.id), {
      batchId,
      reason: "checked",
    });
    const detail = await getPayoutBatchCore(svc, adminCtx(admin.id), batchId);
    const itemId = detail.data?.items[0].id as string;

    const failed = await markPayoutItemCore(svc, adminCtx(admin.id), {
      itemId,
      status: "failed",
      failureReason: "Wrong name on the MoMo account",
    });
    expect(failed.status, failed.message).toBe(200);

    // The commission is ready to pay again and no longer points at the item.
    const { data: back } = await svc
      .from("fieldops_commission")
      .select("status, payout_item_id")
      .eq("member_id", memberBId)
      .eq("campaign_id", campaignId);
    expect(back?.every((c) => c.status === "approved")).toBe(true);
    expect(back?.every((c) => c.payout_item_id === null)).toBe(true);

    // With nothing pending the batch still closes, as a completed run.
    const after = await getPayoutBatchCore(svc, adminCtx(admin.id), batchId);
    expect(after.data?.batch.status).toBe("paid");
  });
});

describe("cancelling a batch", () => {
  it("unwinds everything and makes the money payable again", async () => {
    const built = await buildPayoutBatchCore(svc, adminCtx(admin.id), {
      campaignId,
      label: "Week 39",
      reason: "weekly run",
    });
    expect(built.status, built.message).toBe(200);
    const batchId = built.data?.id as string;

    const cancelled = await cancelPayoutBatchCore(svc, adminCtx(admin.id), {
      batchId,
      reason: "Wrong week; rebuilding",
    });
    expect(cancelled.status, cancelled.message).toBe(200);
    expect(cancelled.data?.status).toBe("cancelled");

    const { data: back } = await svc
      .from("fieldops_commission")
      .select("status")
      .eq("member_id", memberBId)
      .eq("campaign_id", campaignId);
    expect(back?.every((c) => c.status === "approved")).toBe(true);

    // And a fresh batch can be built straight away.
    const rebuilt = await buildPayoutBatchCore(svc, adminCtx(admin.id), {
      campaignId,
      label: "Week 39 rebuilt",
      reason: "rebuild",
    });
    expect(rebuilt.status, rebuilt.message).toBe(200);
    expect(rebuilt.data?.totalMinor).toBe(700);
    await cancelPayoutBatchCore(svc, adminCtx(admin.id), {
      batchId: rebuilt.data?.id as string,
      reason: "tidy up after the test",
    });
  });

  it("refuses to cancel a batch that has already paid someone", async () => {
    const { data: paidBatch } = await svc
      .from("fieldops_payout_batch")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("label", "Week 37")
      .single();
    const res = await cancelPayoutBatchCore(svc, adminCtx(admin.id), {
      batchId: paidBatch?.id as string,
      reason: "should not work",
    });
    expect(res.status).toBe(400);
  });
});

describe("what the member and the office see", () => {
  it("shows the member their payment history and paid total", async () => {
    const mine = await getMyEarningsCore(svc, memberA.id, { campaignId });
    expect(mine.status, mine.message).toBe(200);
    expect(mine.data?.totals.paidMinor).toBe(1000);
    expect(mine.data?.payouts.length).toBeGreaterThan(0);
    const paid = mine.data?.payouts.find((p) => p.status === "paid");
    expect(paid?.paymentReference).toBe("MM-77841");
    expect(paid?.batchLabel).toBe("Week 37");
  });

  it("lets a member read only their own payout line", async () => {
    const { data: own } = await memberA.client
      .from("fieldops_payout_item")
      .select("id, amount_minor");
    expect((own ?? []).length).toBeGreaterThan(0);

    const { data: others } = await memberB.client
      .from("fieldops_payout_item")
      .select("id")
      .eq("member_user_id", memberA.id);
    expect(others ?? []).toEqual([]);

    // The destination snapshot is not in the client grant at all.
    const { error } = await memberA.client
      .from("fieldops_payout_item")
      .select("destination_snapshot");
    expect(error).not.toBeNull();
  });

  it("refuses every client write to batches and items", async () => {
    const { error: batchInsert } = await memberA.client
      .from("fieldops_payout_batch")
      .insert({
        campaign_id: campaignId,
        label: "cheat",
        created_by: memberA.id,
      } as never);
    expect(batchInsert).not.toBeNull();

    const { data: mine } = await memberA.client
      .from("fieldops_payout_item")
      .select("id")
      .limit(1)
      .single();
    const { error: itemUpdate } = await memberA.client
      .from("fieldops_payout_item")
      .update({ status: "paid" } as never)
      .eq("id", mine?.id as string);
    expect(itemUpdate).not.toBeNull();
  });

  it("exports the finance CSV only with users.view_pii", async () => {
    // The Week 37 batch is the one that actually paid member A.
    const { data: batch } = await svc
      .from("fieldops_payout_batch")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("label", "Week 37")
      .single();
    const denied = await exportPayoutBatchCsvCore(
      svc,
      adminCtx(admin.id),
      batch?.id as string,
    );
    expect(denied.status).toBe(403);

    const ok = await exportPayoutBatchCsvCore(
      svc,
      adminCtx(admin.id, ["users.view_pii"]),
      batch?.id as string,
    );
    expect(ok.status, ok.message).toBe(200);
    expect(ok.data?.csv).toContain("0241234567");
    expect(ok.data?.csv.split("\n")[0]).toContain("reference");
    expect(ok.data?.filename).toMatch(/\.csv$/);
  });
});

describe("the books balance", () => {
  it("agrees between the ledger and the payout items, even after a reversal", async () => {
    const before = await svc.rpc("fieldops_payout_reconciliation");
    const b = before.data as Record<string, number>;
    expect(Number(b.fieldops_payout_drift_minor)).toBe(0);
    expect(Number(b.fieldops_stranded_in_payout)).toBe(0);
    expect(Number(b.fieldops_paid_without_reference)).toBe(0);

    // Reverse one of the commissions that was already paid out: the money
    // really left, so the payout item stays paid and a negative offset
    // records the claw-back. The two sides must still agree.
    const { data: paidOne } = await svc
      .from("fieldops_commission")
      .select("id")
      .eq("member_id", memberAId)
      .eq("status", "paid")
      .is("reverses_commission_id", null)
      .limit(1)
      .single();
    const reversed = await reverseCommissionAdminCore(svc, adminCtx(admin.id), {
      commissionId: paidOne?.id as string,
      reason: "The listing turned out to be a duplicate.",
    });
    expect(reversed.status, reversed.message).toBe(200);

    const after = await svc.rpc("fieldops_payout_reconciliation");
    const a = after.data as Record<string, number>;
    expect(Number(a.fieldops_payout_drift_minor)).toBe(0);
    expect(Number(a.fieldops_stranded_in_payout)).toBe(0);

    // The paid row keeps its status (the money really did leave) and the
    // negative offset beside it nets the member down to what they keep.
    const { data: original } = await svc
      .from("fieldops_commission")
      .select("status, reversed_at")
      .eq("id", paidOne?.id as string)
      .single();
    expect(original?.status).toBe("paid");
    expect(original?.reversed_at).toBeTruthy();

    const mine = await getMyEarningsCore(svc, memberA.id, { campaignId });
    expect(mine.data?.totals.paidMinor).toBe(500);

    // And it cannot be reversed a second time.
    const twice = await reverseCommissionAdminCore(svc, adminCtx(admin.id), {
      commissionId: paidOne?.id as string,
      reason: "Trying again",
    });
    expect(twice.status).toBe(400);
  });

  it("reports a healthy payout picture", async () => {
    const { data } = await svc.rpc("fieldops_health");
    const h = data as Record<string, number | boolean>;
    // fieldops_health() sums the whole database, so only the invariants are
    // asserted exactly; the absolute total just has to include this run.
    expect(Number(h.payout_drift_minor)).toBe(0);
    expect(Number(h.stuck_in_payout)).toBe(0);
    expect(Number(h.paid_minor)).toBeGreaterThanOrEqual(1000);
  });

  it("refuses a batch while payouts are switched off", async () => {
    await patchSettings({ payoutsEnabled: false }, "kill switch test");
    const res = await buildPayoutBatchCore(svc, adminCtx(admin.id), {
      campaignId,
      label: "Should not build",
      reason: "kill switch",
    });
    expect(res.status).toBe(400);
    expect(res.message).toMatch(/switched off/i);
    await patchSettings({ payoutsEnabled: true }, "back on");
  });
});
