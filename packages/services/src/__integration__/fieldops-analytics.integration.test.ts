import type {
  AdminContext,
  AdminPermissionKey,
} from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  exportCampaignStatsCsvCore,
  getCampaignAnalyticsCore,
} from "../admin/fieldOps/analyticsAdminCore";
import {
  setCampaignStatusCore,
  upsertCampaignCore,
} from "../admin/fieldOps/campaignsAdminCore";
import { upsertTerritoryCore } from "../admin/fieldOps/regionsAdminCore";
import { updateFieldOpsSettingsCore } from "../admin/fieldOps/settingsAdminCore";
import { addTeamMemberCore } from "../admin/fieldOps/teamAdminCore";
import { createAssignmentCore } from "../fieldOps/lead/leadAssignmentsCore";
import { getLeadPerformanceCore } from "../fieldOps/lead/performanceQuery";
import {
  createProspectCore,
  updateProspectCore,
} from "../fieldOps/member/prospectsCore";
import { todayIso } from "../fieldOps/shared/fieldOpsRows";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Field Ops Phase 7: the figures.
//
// Every number is counted from the records the programme already writes, so
// these tests seed a known shape and check the arithmetic comes back —
// coverage, the funnel, per-member totals, and the day series (including
// the empty days, which a chart needs).

const svc = getServiceClient() as ServiceRoleClient;

const adminCtx = (
  userId: string,
  permissions: AdminPermissionKey[] = [
    "fieldops.view",
    "fieldops.manage",
    "fieldops.rules",
  ],
): AdminContext => ({
  userId,
  email: null,
  roles: ["field_ops_manager"],
  permissions,
  reauthenticatedAt: Date.now(),
});

let admin: TestUser;
let lead: TestUser;
let memberA: TestUser;
let memberB: TestUser;
let regionId: string;
let campaignId: string;
let townA: string;
let townB: string;
let memberAId: string;
let memberBId: string;
let teamId: string;

const today = todayIso();
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
 * Onboardings are seeded straight in at a chosen status: the earlier suites
 * already prove how a row gets there, and what is under test here is the
 * arithmetic on top.
 */
async function seedOnboarding(opts: {
  memberId: string;
  memberUserId: string;
  territoryId: string;
  status: string;
  kind?: string;
  submittedAt?: string;
  succeededAt?: string;
}) {
  const { data, error } = await svc
    .from("fieldops_onboarding")
    .insert({
      campaign_id: campaignId,
      team_id: teamId,
      member_id: opts.memberId,
      member_user_id: opts.memberUserId,
      territory_id: opts.territoryId,
      mode: "offline",
      kind: opts.kind ?? "place",
      business_name: `Seeded ${crypto.randomUUID().slice(0, 6)}`,
      status: opts.status,
      submitted_at: opts.submittedAt ?? new Date().toISOString(),
      succeeded_at: opts.succeededAt ?? null,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(`seed onboarding failed: ${error.message}`);
  return data?.id as string;
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  [admin, lead, memberA, memberB] = await Promise.all([
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
  ]);

  await patchSettings(
    { programEnabled: true, requireMemberPhoneVerified: false },
    "integration test",
  );

  const ctx = adminCtx(admin.id);
  const { data: region } = await svc
    .from("fieldops_region")
    .insert({ name: `FieldOps figures ${uniq}`, country_code: "GH" } as never)
    .select("id")
    .single();
  regionId = region?.id as string;
  const created = await upsertCampaignCore(svc, ctx, {
    regionId,
    name: "Figures campaign",
    currency: "GHS",
  });
  campaignId = created.data?.id as string;

  const a = await upsertTerritoryCore(svc, ctx, {
    regionId,
    name: "Ejisu",
    kind: "town",
    centre: { lat: 6.7208, lng: -1.3661 },
    radiusM: 4000,
  });
  townA = a.data?.id as string;
  const b = await upsertTerritoryCore(svc, ctx, {
    regionId,
    name: "Juaben",
    kind: "town",
    centre: { lat: 6.78, lng: -1.4 },
    radiusM: 4000,
  });
  townB = b.data?.id as string;

  await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "team_lead",
    userId: lead.id,
  });
  const ma = await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "offline_member",
    userId: memberA.id,
  });
  memberAId = ma.data?.id as string;
  const mb = await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "offline_member",
    userId: memberB.id,
  });
  memberBId = mb.data?.id as string;
  const { data: team } = await svc
    .from("fieldops_team")
    .select("id")
    .eq("campaign_id", campaignId)
    .single();
  teamId = team?.id as string;

  const active = await setCampaignStatusCore(svc, ctx, {
    campaignId,
    action: "activate",
    reason: "t",
  });
  expect(active.status, active.message).toBe(200);

  // A known shape: only Ejisu is covered, only member A is out, and member
  // A has three onboardings of which one stood up and one was rejected.
  const assignment = await createAssignmentCore(svc, lead.id, {
    campaignId,
    memberId: memberAId,
    territoryId: townA,
    startsOn: today,
    endsOn: today,
  });
  expect(assignment.status, assignment.message).toBe(200);

  const first = await createProspectCore(svc, memberA.id, {
    campaignId,
    territoryId: townA,
    kind: "place",
    name: "Spoken to already",
    contactChannel: "in_person",
  });
  expect(first.status, first.message).toBe(200);
  // A prospect starts "identified"; logging a contact is what moves it on.
  const logged = await updateProspectCore(svc, memberA.id, {
    campaignId,
    prospectId: first.data?.id as string,
    status: "contacted",
  });
  expect(logged.status, logged.message).toBe(200);
  const second = await createProspectCore(svc, memberA.id, {
    campaignId,
    territoryId: townA,
    kind: "place",
    name: "Only found",
  });
  expect(second.status, second.message).toBe(200);

  await seedOnboarding({
    memberId: memberAId,
    memberUserId: memberA.id,
    territoryId: townA,
    status: "succeeded",
    succeededAt: new Date().toISOString(),
  });
  await seedOnboarding({
    memberId: memberAId,
    memberUserId: memberA.id,
    territoryId: townA,
    status: "rejected",
  });
  await seedOnboarding({
    memberId: memberAId,
    memberUserId: memberA.id,
    territoryId: townA,
    status: "submitted",
  });
});

afterAll(async () => {
  await svc.from("fieldops_onboarding").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_prospect").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_assignment").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_team_member").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_team").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_campaign").delete().eq("id", campaignId);
  await svc.from("fieldops_territory").delete().eq("region_id", regionId);
  await svc.from("fieldops_region").delete().eq("id", regionId);
  await patchSettings(
    { programEnabled: false, requireMemberPhoneVerified: true },
    "cleanup",
  ).catch(() => undefined);
  await Promise.all(
    [admin, lead, memberA, memberB].map((u) => deleteTestUser(svc, u.id)),
  );
});

describe("campaign figures", () => {
  it("counts coverage from real assignments, not from a column", async () => {
    const res = await getCampaignAnalyticsCore(
      svc,
      adminCtx(admin.id),
      campaignId,
    );
    expect(res.status, res.message).toBe(200);
    const t = res.data?.stats.territories;
    expect(t?.total).toBe(2);
    expect(t?.covered).toBe(1); // only Ejisu has an open assignment
    expect(t?.uncovered).toBe(1);
    expect(t?.coveragePct).toBe(50);
  });

  it("counts the funnel and the onboarding statuses", async () => {
    const res = await getCampaignAnalyticsCore(
      svc,
      adminCtx(admin.id),
      campaignId,
    );
    const s = res.data?.stats;
    expect(s?.prospects.total).toBe(2);
    expect(s?.prospects.contacted).toBe(1);
    expect(s?.onboardings.total).toBe(3);
    expect(s?.onboardings.succeeded).toBe(1);
    expect(s?.onboardings.rejected).toBe(1);
    expect(s?.onboardings.submitted).toBe(1);
    expect(s?.onboardings.places).toBe(3);
    expect(s?.members.active).toBe(3);
  });

  it("says nothing rather than zero when the cost per success is unknowable", async () => {
    const res = await getCampaignAnalyticsCore(
      svc,
      adminCtx(admin.id),
      campaignId,
    );
    // One success but no commissions in this fixture, so the figure is 0 —
    // the null case is the one with no successes at all, checked below.
    expect(res.data?.stats.costPerSuccessMinor).toBe(0);

    const empty = await upsertCampaignCore(svc, adminCtx(admin.id), {
      regionId,
      name: "Nothing happened here",
      currency: "GHS",
    });
    const none = await getCampaignAnalyticsCore(
      svc,
      adminCtx(admin.id),
      empty.data?.id as string,
    );
    expect(none.data?.stats.costPerSuccessMinor).toBeNull();
    await svc
      .from("fieldops_campaign")
      .delete()
      .eq("id", empty.data?.id as string);
  });

  it("breaks the work down per member", async () => {
    const res = await getCampaignAnalyticsCore(
      svc,
      adminCtx(admin.id),
      campaignId,
    );
    const members = res.data?.members ?? [];
    const a = members.find((m) => m.memberId === memberAId);
    const b = members.find((m) => m.memberId === memberBId);
    expect(a?.assignedDays).toBe(1);
    expect(a?.prospects).toBe(2);
    expect(a?.submitted).toBe(3);
    expect(a?.succeeded).toBe(1);
    expect(a?.rejected).toBe(1);
    // Member B did nothing, and shows as zero rather than being missing.
    expect(b?.submitted).toBe(0);
    expect(b?.assignedDays).toBe(0);
    expect(members.length).toBe(3);
  });

  it("breaks the funnel down per town", async () => {
    const res = await getCampaignAnalyticsCore(
      svc,
      adminCtx(admin.id),
      campaignId,
    );
    const towns = res.data?.territories ?? [];
    const ejisu = towns.find((t) => t.territoryId === townA);
    const juaben = towns.find((t) => t.territoryId === townB);
    expect(ejisu?.covered).toBe(true);
    expect(ejisu?.prospects).toBe(2);
    expect(ejisu?.contacted).toBe(1);
    expect(ejisu?.submitted).toBe(3);
    expect(ejisu?.succeeded).toBe(1);
    expect(juaben?.covered).toBe(false);
    expect(juaben?.submitted).toBe(0);
  });

  it("returns every day in the window, including the empty ones", async () => {
    const res = await getCampaignAnalyticsCore(
      svc,
      adminCtx(admin.id),
      campaignId,
      7,
    );
    const daily = res.data?.daily ?? [];
    expect(daily.length).toBe(7);
    // Today has the seeded work; the days before it are real zeroes, which
    // is what stops a chart drawing a misleading straight line.
    expect(daily[daily.length - 1]?.submitted).toBe(3);
    expect(daily[0]?.submitted).toBe(0);
    expect(daily.every((d) => typeof d.day === "string")).toBe(true);
  });

  it("needs the view permission", async () => {
    const res = await getCampaignAnalyticsCore(
      svc,
      adminCtx(admin.id, ["dashboard.view"]),
      campaignId,
    );
    expect(res.status).toBe(403);
  });
});

describe("what the lead sees", () => {
  it("gets the same figures for their own campaign", async () => {
    const res = await getLeadPerformanceCore(svc, lead.id, { campaignId });
    expect(res.status, res.message).toBe(200);
    expect(res.data?.stats.onboardings.succeeded).toBe(1);
    expect(res.data?.members.length).toBe(3);
    expect(res.data?.territories.length).toBe(2);
  });

  it("is refused for a member who is not the lead", async () => {
    const res = await getLeadPerformanceCore(svc, memberA.id, { campaignId });
    expect(res.status).toBe(403);
  });
});

describe("the spreadsheet", () => {
  it("has one row per member with the same numbers", async () => {
    const res = await exportCampaignStatsCsvCore(
      svc,
      adminCtx(admin.id),
      campaignId,
    );
    expect(res.status, res.message).toBe(200);
    const lines = (res.data?.csv ?? "").split("\n");
    expect(lines[0]).toContain("median_review_hours");
    expect(lines.length).toBe(4); // header + three members
    expect(res.data?.filename).toMatch(/\.csv$/);
  });
});
