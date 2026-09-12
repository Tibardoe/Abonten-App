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
import {
  listContentAdminCore,
  reviewContentAdminCore,
  runMonthlyStipendsCore,
} from "../admin/fieldOps/contentAdminCore";
import { upsertTerritoryCore } from "../admin/fieldOps/regionsAdminCore";
import {
  publishCommissionRuleVersionCore,
  setCommissionRuleActiveCore,
} from "../admin/fieldOps/rulesAdminCore";
import { updateFieldOpsSettingsCore } from "../admin/fieldOps/settingsAdminCore";
import { addTeamMemberCore } from "../admin/fieldOps/teamAdminCore";
import {
  listTeamContentCore,
  reviewContentCore,
  upsertContentBriefCore,
} from "../fieldOps/lead/contentLeadCore";
import {
  getMyContentCore,
  submitContentCore,
} from "../fieldOps/member/contentCore";
import { getMyEarningsCore } from "../fieldOps/member/earningsQuery";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Field Ops Phase 6: the content creator.
//
//   * only the content creator submits; everyone on the campaign can read
//     the briefs
//   * the same post cannot be sent in twice by anyone
//   * a lead cannot review their own content (service and DB CHECK)
//   * approval records a PENDING commission at the live rule and starts a
//     holding period; the content sweep confirms it afterwards
//   * a creator who leaves before the holding period ends is not paid
//   * rejection pays nothing
//   * monthly stipends are idempotent per member per month

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
    ...extra,
  ],
  reauthenticatedAt: Date.now(),
});

let admin: TestUser;
let admin2: TestUser;
let lead: TestUser;
let creator: TestUser;
let fieldMember: TestUser;
let regionId: string;
let campaignId: string;
let creatorId: string;
let leadId: string;
let deliverableRuleId: string;

const uniq = String(Date.now()).slice(-8);
const linkFor = (slug: string) =>
  `https://tiktok.com/@abonten/video/${uniq}${slug}`;

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

const sweepContent = async () => {
  const { data, error } = await svc.rpc("fieldops_sweep_content", {
    p_limit: 100,
  });
  expect(error, error?.message).toBeNull();
  return data as Record<string, number | boolean>;
};

const commissionFor = async (submissionId: string) => {
  const { data } = await svc
    .from("fieldops_commission")
    .select("id, status, amount_minor, activity_key, approved_by")
    .eq("content_submission_id", submissionId)
    .is("reverses_commission_id", null)
    .maybeSingle();
  return data;
};

const makeDue = (submissionId: string) =>
  svc
    .from("fieldops_content_submission")
    .update({
      holding_until: new Date(Date.now() - 60_000).toISOString(),
    } as never)
    .eq("id", submissionId);

async function sendPost(slug: string, briefId?: string) {
  const res = await submitContentCore(svc, creator.id, {
    campaignId,
    briefId: briefId ?? null,
    platform: "tiktok",
    url: linkFor(slug),
    caption: "Behind the counter at Auntie Ama's",
    selfReportedMetrics: { views: 12000, likes: 900, shares: 40 },
  });
  expect(res.status, res.message).toBe(200);
  return res.data?.id as string;
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  [admin, admin2, lead, creator, fieldMember] = await Promise.all([
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
      requireMemberPhoneVerified: false,
    },
    "integration test",
  );

  const ctx = adminCtx(admin.id);
  const { data: region } = await svc
    .from("fieldops_region")
    .insert({ name: `FieldOps content ${uniq}`, country_code: "GH" } as never)
    .select("id")
    .single();
  regionId = region?.id as string;
  const created = await upsertCampaignCore(svc, ctx, {
    regionId,
    name: "Content campaign",
    currency: "GHS",
  });
  campaignId = created.data?.id as string;
  await upsertTerritoryCore(svc, ctx, {
    regionId,
    name: "Ejisu",
    kind: "town",
    centre: { lat: 6.7208, lng: -1.3661 },
    radiusM: 4000,
  });

  const l = await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "team_lead",
    userId: lead.id,
  });
  leadId = l.data?.id as string;
  const c = await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "content_creator",
    userId: creator.id,
  });
  creatorId = c.data?.id as string;
  await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "offline_member",
    userId: fieldMember.id,
  });

  // Campaign-scoped rules so the programme defaults stay inactive.
  const dl = await publishCommissionRuleVersionCore(svc, ctx, {
    campaignId,
    activityKey: "content_deliverable",
    amountMinor: 300,
    currency: "GHS",
    eligibility: { holding_days: 3 },
    note: "Integration test deliverable rule.",
    reason: "integration test",
  });
  expect(dl.status, dl.message).toBe(200);
  deliverableRuleId = dl.data?.id as string;
  const dlLive = await setCommissionRuleActiveCore(svc, adminCtx(admin2.id), {
    campaignId,
    activityKey: "content_deliverable",
    ruleId: deliverableRuleId,
    reason: "integration test",
  });
  expect(dlLive.status, dlLive.message).toBe(200);

  for (const key of [
    "content_monthly_stipend",
    "team_lead_monthly_stipend",
  ] as const) {
    const st = await publishCommissionRuleVersionCore(svc, ctx, {
      campaignId,
      activityKey: key,
      amountMinor: 20_000,
      currency: "GHS",
      eligibility: {},
      note: "Integration test stipend rule.",
      reason: "integration test",
    });
    expect(st.status, st.message).toBe(200);
    const live = await setCommissionRuleActiveCore(svc, adminCtx(admin2.id), {
      campaignId,
      activityKey: key,
      ruleId: st.data?.id as string,
      reason: "integration test",
    });
    expect(live.status, live.message).toBe(200);
  }

  const active = await setCampaignStatusCore(svc, ctx, {
    campaignId,
    action: "activate",
    reason: "t",
  });
  expect(active.status, active.message).toBe(200);
});

afterAll(async () => {
  await patchSettings(
    { programEnabled: false, requireMemberPhoneVerified: true },
    "cleanup",
  ).catch(() => undefined);
  await Promise.all(
    [admin, admin2, lead, creator, fieldMember].map((u) =>
      deleteTestUser(svc, u.id),
    ),
  );
});

describe("briefs", () => {
  let briefId: string;

  it("is written by the lead and assigned to the content creator", async () => {
    const res = await upsertContentBriefCore(svc, lead.id, {
      campaignId,
      title: "Market day reel",
      description: "A 30-second reel from Ejisu market on a Wednesday.",
      platforms: ["tiktok", "instagram"],
      assignedMemberId: creatorId,
      dueOn: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    });
    expect(res.status, res.message).toBe(200);
    briefId = res.data?.id as string;
    expect(res.data?.assignedMemberId).toBe(creatorId);
    expect(res.data?.status).toBe("open");
  });

  it("cannot be assigned to someone who is not the creator", async () => {
    const res = await upsertContentBriefCore(svc, lead.id, {
      campaignId,
      title: "Wrong assignee",
      platforms: [],
      assignedMemberId: leadId,
    });
    expect(res.status).toBe(409);
  });

  it("is refused from anyone who is not the lead", async () => {
    const res = await upsertContentBriefCore(svc, creator.id, {
      campaignId,
      title: "Self-assigned",
      platforms: [],
    });
    expect(res.status).toBe(403);
  });

  it("is readable by everyone on the campaign", async () => {
    const asField = await getMyContentCore(svc, fieldMember.id, { campaignId });
    expect(asField.status, asField.message).toBe(200);
    expect(asField.data?.briefs.some((b) => b.id === briefId)).toBe(true);
    // ...but only the creator can send anything in.
    expect(asField.data?.canSubmit).toBe(false);

    const asCreator = await getMyContentCore(svc, creator.id, { campaignId });
    expect(asCreator.data?.canSubmit).toBe(true);
    expect(asCreator.data?.liveRate?.amountMinor).toBe(300);

    const { data: viaClient } = await fieldMember.client
      .from("fieldops_content_brief")
      .select("id")
      .eq("campaign_id", campaignId);
    expect((viaClient ?? []).length).toBeGreaterThan(0);
  });
});

describe("sending in a post", () => {
  let submissionId: string;

  it("is refused from a member who is not the content creator", async () => {
    const res = await submitContentCore(svc, fieldMember.id, {
      campaignId,
      platform: "tiktok",
      url: linkFor("-nope"),
    });
    expect(res.status).toBe(403);
  });

  it("records the post with the creator's own figures", async () => {
    submissionId = await sendPost("-a");
    const mine = await getMyContentCore(svc, creator.id, { campaignId });
    const sub = mine.data?.submissions.find((s) => s.id === submissionId);
    expect(sub?.status).toBe("submitted");
    expect(sub?.selfReportedMetrics.views).toBe(12000);
  });

  it("refuses the same post twice, from anyone", async () => {
    const again = await submitContentCore(svc, creator.id, {
      campaignId,
      platform: "instagram",
      url: linkFor("-a"),
    });
    expect(again.status).toBe(409);
  });

  it("shows up in the lead's queue, waiting first", async () => {
    const team = await listTeamContentCore(svc, lead.id, { campaignId });
    expect(team.status, team.message).toBe(200);
    expect(team.data?.submissions[0]?.status).toBe("submitted");
    expect(team.data?.submissions[0]?.memberName).toBeDefined();
  });

  it("lets nobody but the creator and their lead read it", async () => {
    const { data: asCreator } = await creator.client
      .from("fieldops_content_submission")
      .select("id")
      .eq("campaign_id", campaignId);
    expect((asCreator ?? []).length).toBeGreaterThan(0);

    const { data: asLead } = await lead.client
      .from("fieldops_content_submission")
      .select("id")
      .eq("campaign_id", campaignId);
    expect((asLead ?? []).length).toBe((asCreator ?? []).length);

    const { data: asOther } = await fieldMember.client
      .from("fieldops_content_submission")
      .select("id")
      .eq("campaign_id", campaignId);
    expect(asOther ?? []).toEqual([]);
  });

  it("refuses every client write", async () => {
    const { error } = await creator.client
      .from("fieldops_content_submission")
      .update({ status: "approved" } as never)
      .eq("id", submissionId);
    expect(error).not.toBeNull();
  });
});

describe("reviewing a deliverable", () => {
  it("records a pending commission and a holding period on approval", async () => {
    const id = await sendPost("-b");
    const res = await reviewContentCore(svc, lead.id, {
      campaignId,
      submissionId: id,
      decision: "approved",
    });
    expect(res.status, res.message).toBe(200);
    expect(res.data?.status).toBe("approved");
    expect(res.data?.holdingUntil).toBeTruthy();

    const c = await commissionFor(id);
    expect(c?.status).toBe("pending");
    expect(Number(c?.amount_minor)).toBe(300);
    expect(c?.activity_key).toBe("content_deliverable");
    // Nobody has approved the money yet — only the sweep does that.
    expect(c?.approved_by).toBeNull();
  });

  it("pays nothing for a rejection, and needs a reason", async () => {
    const id = await sendPost("-c");
    const noReason = await reviewContentCore(svc, lead.id, {
      campaignId,
      submissionId: id,
      decision: "rejected",
    });
    expect(noReason.status).toBe(409);

    const res = await reviewContentCore(svc, lead.id, {
      campaignId,
      submissionId: id,
      decision: "rejected",
      note: "The shop name is not readable in the video.",
    });
    expect(res.status, res.message).toBe(200);
    expect(await commissionFor(id)).toBeNull();
  });

  it("refuses a second decision on the same deliverable", async () => {
    const id = await sendPost("-d");
    await reviewContentCore(svc, lead.id, {
      campaignId,
      submissionId: id,
      decision: "approved",
    });
    const again = await reviewContentCore(svc, lead.id, {
      campaignId,
      submissionId: id,
      decision: "rejected",
      note: "Changed my mind",
    });
    expect(again.status).toBe(409);
  });

  it("refuses a reviewer who is not this team's lead", async () => {
    const id = await sendPost("-e");
    const res = await reviewContentCore(svc, fieldMember.id, {
      campaignId,
      submissionId: id,
      decision: "approved",
    });
    expect(res.status).toBe(403);
  });

  it("lets an admin decide in the lead's place, audited", async () => {
    const id = await sendPost("-f");
    const denied = await reviewContentAdminCore(
      svc,
      { ...adminCtx(admin.id), permissions: ["fieldops.view"] },
      { submissionId: id, decision: "approved" },
    );
    expect(denied.status).toBe(403);

    const res = await reviewContentAdminCore(svc, adminCtx(admin.id), {
      submissionId: id,
      decision: "approved",
    });
    expect(res.status, res.message).toBe(200);

    const { data: audit } = await svc
      .from("admin_audit_log")
      .select("action")
      .eq("target_id", id)
      .eq("action", "fieldops.content.approved");
    expect(audit?.length).toBe(1);
  });

  it("shows the admin every brief and deliverable", async () => {
    const list = await listContentAdminCore(svc, adminCtx(admin.id), {
      campaignId,
    });
    expect(list.status, list.message).toBe(200);
    expect(list.data?.briefs.length).toBeGreaterThan(0);
    expect(list.data?.submissions.length).toBeGreaterThan(0);
    expect(list.data?.submissions[0]?.campaignName).toBe("Content campaign");
  });
});

describe("the content sweep", () => {
  it("confirms the commission once the holding period has elapsed", async () => {
    const id = await sendPost("-g");
    await reviewContentCore(svc, lead.id, {
      campaignId,
      submissionId: id,
      decision: "approved",
    });
    // Not due yet.
    const early = await sweepContent();
    expect(Number(early.approved ?? 0)).toBe(0);
    expect((await commissionFor(id))?.status).toBe("pending");

    await makeDue(id);
    const result = await sweepContent();
    expect(Number(result.approved)).toBeGreaterThanOrEqual(1);
    const c = await commissionFor(id);
    expect(c?.status).toBe("approved");
    expect(c?.approved_by).toBeNull();

    // And running it again changes nothing.
    await sweepContent();
    const { count } = await svc
      .from("fieldops_commission")
      .select("id", { count: "exact", head: true })
      .eq("content_submission_id", id);
    expect(count).toBe(1);
  });

  it("does not pay a creator who left before the holding period ended", async () => {
    const id = await sendPost("-h");
    await reviewContentCore(svc, lead.id, {
      campaignId,
      submissionId: id,
      decision: "approved",
    });
    await svc
      .from("fieldops_team_member")
      .update({ status: "left", left_at: new Date().toISOString() } as never)
      .eq("id", creatorId);

    await makeDue(id);
    await sweepContent();
    expect((await commissionFor(id))?.status).toBe("rejected");

    // Put them back for the stipend tests.
    await svc
      .from("fieldops_team_member")
      .update({ status: "active", left_at: null } as never)
      .eq("id", creatorId);
  });

  it("does nothing while the programme is switched off", async () => {
    await patchSettings({ commissionGenerationEnabled: false }, "kill switch");
    const res = await sweepContent();
    expect(res.skipped).toBe(true);
    await patchSettings({ commissionGenerationEnabled: true }, "back on");
  });
});

describe("monthly stipends", () => {
  const month = new Date().toISOString().slice(0, 7);

  it("adds one approved stipend per lead and creator, with the admin recorded", async () => {
    const res = await runMonthlyStipendsCore(svc, adminCtx(admin.id), {
      campaignId,
      periodStart: `${month}-01`,
      reason: "monthly run",
    });
    expect(res.status, res.message).toBe(200);
    expect(res.data?.created).toBe(2);
    expect(res.data?.totalMinor).toBe(40_000);

    const { data: rows } = await svc
      .from("fieldops_commission")
      .select("member_id, status, amount_minor, activity_key, approved_by")
      .eq("campaign_id", campaignId)
      .not("period_start", "is", null);
    expect(rows?.length).toBe(2);
    expect(rows?.every((r) => r.status === "approved")).toBe(true);
    expect(rows?.every((r) => r.approved_by === admin.id)).toBe(true);
    expect(rows?.map((r) => r.activity_key).sort()).toEqual([
      "content_monthly_stipend",
      "team_lead_monthly_stipend",
    ]);
  });

  it("pays nobody twice for the same month", async () => {
    const again = await runMonthlyStipendsCore(svc, adminCtx(admin.id), {
      campaignId,
      periodStart: `${month}-15`,
      reason: "accidental second run",
    });
    expect(again.status, again.message).toBe(200);
    expect(again.data?.created).toBe(0);

    const { count } = await svc
      .from("fieldops_commission")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .not("period_start", "is", null);
    expect(count).toBe(2);
  });

  it("refuses a month that has not started", async () => {
    const next = new Date();
    next.setMonth(next.getMonth() + 2);
    const res = await runMonthlyStipendsCore(svc, adminCtx(admin.id), {
      campaignId,
      periodStart: `${next.toISOString().slice(0, 7)}-01`,
      reason: "too early",
    });
    expect(res.status).toBe(400);
  });

  it("needs the commissions-approve permission", async () => {
    const res = await runMonthlyStipendsCore(
      svc,
      { ...adminCtx(admin.id), permissions: ["fieldops.view"] },
      { campaignId, periodStart: `${month}-01`, reason: "no permission" },
    );
    expect(res.status).toBe(403);
  });

  it("shows up in the creator's earnings", async () => {
    const mine = await getMyEarningsCore(svc, creator.id, { campaignId });
    expect(mine.status, mine.message).toBe(200);
    // One approved deliverable (300) plus the stipend (20000).
    expect(mine.data?.totals.approvedMinor).toBe(20_300);
    expect(
      mine.data?.commissions.some(
        (c) => c.activityKey === "content_monthly_stipend",
      ),
    ).toBe(true);
  });
});
