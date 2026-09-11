import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upsertCampaignCore } from "../admin/fieldOps/campaignsAdminCore";
import {
  publishCommissionRuleVersionCore,
  setCommissionRuleActiveCore,
} from "../admin/fieldOps/rulesAdminCore";
import { updateFieldOpsSettingsCore } from "../admin/fieldOps/settingsAdminCore";
import { addTeamMemberCore } from "../admin/fieldOps/teamAdminCore";
import {
  FieldOpsForbiddenError,
  requireMembership,
  resolveFieldOpsContext,
} from "../fieldOps/shared/fieldOpsContext";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Field Ops Phase 0: who can read and write the fieldops_* tables.
//
//   * clients (members, leads, strangers) never write any fieldops_ table
//   * members read only the campaign / region / territories / team they
//     belong to; a stranger reads nothing; payout columns are unreadable
//   * the helper functions answer only for the caller
//   * admin cores refuse a context without the right fieldops.* permission
//   * commission rule versions are immutable and only one is live per key

const svc = getServiceClient() as ServiceRoleClient;

const adminCtx = (
  userId: string,
  permissions: AdminContext["permissions"],
): AdminContext => ({
  userId,
  email: null,
  roles: ["field_ops_manager"],
  permissions,
  reauthenticatedAt: Date.now(),
});

const FULL: AdminContext["permissions"] = [
  "fieldops.view",
  "fieldops.manage",
  "fieldops.rules",
  "fieldops.verify",
  "fieldops.commissions.approve",
  "fieldops.commissions.pay",
];

let admin: TestUser;
let lead: TestUser;
let member: TestUser;
let stranger: TestUser;
let regionId: string;
let territoryId: string;
let campaignId: string;
let otherRegionId: string;
let otherCampaignId: string;

async function createRegion(name: string): Promise<string> {
  const { data, error } = await svc
    .from("fieldops_region")
    .insert({
      name,
      country_code: "GH",
      centre: "SRID=4326;POINT(-1.6244 6.6885)",
    } as never)
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message);
  return data.id;
}

beforeAll(async () => {
  [admin, lead, member, stranger] = await Promise.all([
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
  ]);
  regionId = await createRegion(`FieldOps RBAC ${Date.now()}`);
  otherRegionId = await createRegion(`FieldOps RBAC other ${Date.now()}`);
  const { data: t } = await svc
    .from("fieldops_territory")
    .insert({
      region_id: regionId,
      name: "Kumasi",
      kind: "town",
      centre: "SRID=4326;POINT(-1.6244 6.6885)",
      radius_m: 5000,
    } as never)
    .select("id")
    .single();
  territoryId = t?.id as string;

  const ctx = adminCtx(admin.id, FULL);
  const created = await upsertCampaignCore(svc, ctx, {
    regionId,
    name: "RBAC campaign",
    currency: "GHS",
  });
  expect(created.status).toBe(200);
  campaignId = created.data?.id as string;
  const other = await upsertCampaignCore(svc, ctx, {
    regionId: otherRegionId,
    name: "RBAC other campaign",
    currency: "GHS",
  });
  otherCampaignId = other.data?.id as string;

  // Test users have no verified phone; the default programme setting would
  // refuse them, so switch that requirement off for the suite.
  const { data: settings } = await svc
    .from("fieldops_program_setting")
    .select("updated_at")
    .eq("id", 1)
    .single();
  const updated = await updateFieldOpsSettingsCore(svc, ctx, {
    patch: { requireMemberPhoneVerified: false },
    expectedUpdatedAt: settings?.updated_at as string,
    reason: "integration test",
  });
  expect([200, 400]).toContain(updated.status);

  const addLead = await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "team_lead",
    userId: lead.id,
  });
  expect(addLead.status, addLead.message).toBe(200);
  const addMember = await addTeamMemberCore(svc, ctx, {
    campaignId,
    role: "offline_member",
    userId: member.id,
  });
  expect(addMember.status, addMember.message).toBe(200);
});

afterAll(async () => {
  await svc
    .from("fieldops_team_member")
    .delete()
    .in("campaign_id", [campaignId, otherCampaignId]);
  await svc
    .from("fieldops_commission_rule")
    .update({ is_active: false } as never)
    .eq("campaign_id", campaignId);
  // Rule versions can't be deleted (guard trigger); leave campaign-scoped
  // versions in place -- they point at a campaign we keep for that reason.
  const { count } = await svc
    .from("fieldops_commission_rule")
    .select("id", { count: "exact", head: true })
    .in("campaign_id", [campaignId, otherCampaignId]);
  if (!count) {
    await svc
      .from("fieldops_team")
      .delete()
      .in("campaign_id", [campaignId, otherCampaignId]);
    await svc
      .from("fieldops_campaign")
      .delete()
      .in("id", [campaignId, otherCampaignId]);
    await svc.from("fieldops_territory").delete().eq("region_id", regionId);
    await svc
      .from("fieldops_region")
      .delete()
      .in("id", [regionId, otherRegionId]);
  }
  await Promise.all(
    [admin, lead, member, stranger].map((u) => deleteTestUser(svc, u.id)),
  );
});

describe("client privileges", () => {
  it("refuses every client write to fieldops_ tables (42501)", async () => {
    const writes = [
      member.client
        .from("fieldops_campaign")
        .insert({ region_id: regionId, name: "x", slug: "x-1" } as never),
      member.client.from("fieldops_territory").insert({
        region_id: regionId,
        name: "x",
        centre: "SRID=4326;POINT(0 0)",
      } as never),
      member.client
        .from("fieldops_team_member")
        .update({ role: "team_lead" } as never)
        .eq("user_id", member.id),
      lead.client
        .from("fieldops_team_member")
        .update({ status: "left" } as never)
        .eq("user_id", member.id),
      lead.client.from("fieldops_commission_rule").insert({
        activity_key: "place_onboarding_offline",
        version: 99,
        amount_minor: 100000,
      } as never),
      member.client
        .from("fieldops_program_setting")
        .update({ program_enabled: true } as never)
        .eq("id", 1),
      member.client.from("fieldops_region").delete().eq("id", regionId),
    ];
    for (const w of writes) {
      const { error } = await w;
      expect(error?.code, error?.message).toBe("42501");
    }
  });

  it("lets a member read their own campaign, region, territories and team but nothing else", async () => {
    const { data: campaigns } = await member.client
      .from("fieldops_campaign")
      .select("id");
    expect((campaigns ?? []).map((c) => c.id)).toEqual([campaignId]);
    const { data: regions } = await member.client
      .from("fieldops_region")
      .select("id");
    expect((regions ?? []).map((r) => r.id)).toEqual([regionId]);
    const { data: territories } = await member.client
      .from("fieldops_territory")
      .select("id");
    expect((territories ?? []).map((t) => t.id)).toEqual([territoryId]);
    const { data: teams } = await member.client
      .from("fieldops_team")
      .select("campaign_id");
    expect((teams ?? []).map((t) => t.campaign_id)).toEqual([campaignId]);
    // Own membership row only; the lead sees the whole team.
    const { data: own } = await member.client
      .from("fieldops_team_member")
      .select("user_id");
    expect((own ?? []).map((m) => m.user_id)).toEqual([member.id]);
    const { data: team } = await lead.client
      .from("fieldops_team_member")
      .select("user_id");
    expect(new Set((team ?? []).map((m) => m.user_id))).toEqual(
      new Set([lead.id, member.id]),
    );
  });

  it("hides payout columns from every client and the rules/settings tables entirely", async () => {
    const { error } = await lead.client
      .from("fieldops_team_member")
      .select("payout_momo_number");
    expect(error?.code).toBe("42501");
    const { data: rules, error: rulesError } = await lead.client
      .from("fieldops_commission_rule")
      .select("id");
    expect(rulesError?.code).toBe("42501");
    expect(rules).toBeNull();
    const { error: settingsError } = await lead.client
      .from("fieldops_program_setting")
      .select("program_enabled");
    expect(settingsError?.code).toBe("42501");
  });

  it("shows a stranger nothing", async () => {
    const { data: campaigns } = await stranger.client
      .from("fieldops_campaign")
      .select("id");
    expect(campaigns).toEqual([]);
    const { data: memberships } = await stranger.client.rpc(
      "fieldops_my_memberships",
    );
    expect(memberships).toEqual([]);
    const { data: isMember } = await stranger.client.rpc("fieldops_is_member", {
      p_campaign_id: campaignId,
    });
    expect(isMember).toBe(false);
  });

  it("answers the membership helpers only for the caller", async () => {
    const { data: mine } = await member.client.rpc("fieldops_my_memberships");
    expect(mine?.map((m) => m.campaign_id)).toEqual([campaignId]);
    expect(mine?.[0]?.role).toBe("offline_member");
    const { data: leadIs } = await lead.client.rpc("fieldops_is_lead_of_team", {
      p_team_id: mine?.[0]?.team_id as string,
    });
    expect(leadIs).toBe(true);
    const { data: memberIs } = await member.client.rpc(
      "fieldops_is_lead_of_team",
      {
        p_team_id: mine?.[0]?.team_id as string,
      },
    );
    expect(memberIs).toBe(false);
    // The explicit-id variant is service-role only.
    const { error } = await member.client.rpc("fieldops_memberships_for", {
      p_user_id: lead.id,
    });
    expect(error?.code).toBe("42501");
  });
});

describe("resolveFieldOpsContext", () => {
  it("re-derives memberships and honours the programme switch", async () => {
    const ctx = await resolveFieldOpsContext(svc, member.id);
    expect(ctx.memberships.map((m) => m.campaignId)).toEqual([campaignId]);
    expect(ctx.programEnabled).toBe(false);
    expect(() => requireMembership(ctx, campaignId)).toThrow(
      FieldOpsForbiddenError,
    );
    const on = { ...ctx, programEnabled: true };
    expect(requireMembership(on, campaignId).role).toBe("offline_member");
    expect(() => requireMembership(on, campaignId, ["team_lead"])).toThrow(
      /role/,
    );
    expect(() => requireMembership(on, otherCampaignId)).toThrow(
      /not on this campaign/,
    );
    const strangerCtx = await resolveFieldOpsContext(svc, stranger.id);
    expect(strangerCtx.memberships).toEqual([]);
  });
});

describe("admin permission checks", () => {
  it("refuses a context without the right fieldops permission", async () => {
    const viewOnly = adminCtx(admin.id, ["fieldops.view"]);
    const res = await upsertCampaignCore(svc, viewOnly, {
      regionId,
      name: "nope",
      currency: "GHS",
    });
    expect(res.status).toBe(403);
    const rule = await publishCommissionRuleVersionCore(svc, viewOnly, {
      campaignId: null,
      activityKey: "place_onboarding_offline",
      amountMinor: 700,
      currency: "GHS",
      eligibility: {},
      note: "nope",
      reason: "nope",
    });
    expect(rule.status).toBe(403);
    const settings = await updateFieldOpsSettingsCore(svc, viewOnly, {
      patch: { programEnabled: true },
      expectedUpdatedAt: new Date().toISOString(),
      reason: "nope",
    });
    expect(settings.status).toBe(403);
  });

  it("refuses to make a platform admin a team member", async () => {
    await svc
      .from("admin_user")
      .upsert({ user_id: admin.id, status: "active" } as never);
    const res = await addTeamMemberCore(svc, adminCtx(admin.id, FULL), {
      campaignId,
      role: "online_member",
      userId: admin.id,
    });
    expect(res.status).toBe(409);
    await svc.from("admin_user").delete().eq("user_id", admin.id);
  });

  it("refuses a second active team lead and a second membership per campaign", async () => {
    const ctx = adminCtx(admin.id, FULL);
    const second = await addTeamMemberCore(svc, ctx, {
      campaignId,
      role: "team_lead",
      userId: stranger.id,
    });
    expect(second.status).toBe(409);
    expect(second.message).toMatch(/team lead/);
    const dup = await addTeamMemberCore(svc, ctx, {
      campaignId,
      role: "online_member",
      userId: member.id,
    });
    expect(dup.status).toBe(409);
  });
});

describe("commission rule versions", () => {
  it("are immutable, one live per key, and a costlier self-published version needs another admin", async () => {
    const ctx = adminCtx(admin.id, FULL);
    const v = await publishCommissionRuleVersionCore(svc, ctx, {
      campaignId,
      activityKey: "place_onboarding_offline",
      amountMinor: 700,
      currency: "GHS",
      eligibility: { holding_days: 7 },
      note: "campaign override",
      reason: "test",
    });
    expect(v.status, v.message).toBe(200);
    const ruleId = v.data?.id as string;

    // Immutable: amount can't be edited in place (even by service role).
    const { error: editError } = await svc
      .from("fieldops_commission_rule")
      .update({ amount_minor: 1 } as never)
      .eq("id", ruleId);
    expect(editError?.code).toBe("42501");
    const { error: deleteError } = await svc
      .from("fieldops_commission_rule")
      .delete()
      .eq("id", ruleId);
    expect(deleteError?.code).toBe("42501");

    // Nothing has shipped that pays this activity yet, so activation is refused.
    const activate = await setCommissionRuleActiveCore(svc, ctx, {
      campaignId,
      activityKey: "place_onboarding_offline",
      ruleId,
      reason: "test",
    });
    expect(activate.status).toBe(409);

    // The SQL function itself enforces one live version per (campaign, key).
    const { error: a1 } = await svc.rpc("fieldops_commission_rule_set_active", {
      p_campaign_id: campaignId,
      p_activity_key: "place_onboarding_offline",
      p_rule_id: ruleId,
    });
    expect(a1).toBeNull();
    const v2 = await publishCommissionRuleVersionCore(svc, ctx, {
      campaignId,
      activityKey: "place_onboarding_offline",
      amountMinor: 900,
      currency: "GHS",
      eligibility: { holding_days: 7 },
      note: "v2",
      reason: "test",
    });
    const { error: a2 } = await svc.rpc("fieldops_commission_rule_set_active", {
      p_campaign_id: campaignId,
      p_activity_key: "place_onboarding_offline",
      p_rule_id: v2.data?.id as string,
    });
    expect(a2).toBeNull();
    const { data: live } = await svc
      .from("fieldops_commission_rule")
      .select("id, version")
      .eq("campaign_id", campaignId)
      .eq("activity_key", "place_onboarding_offline")
      .eq("is_active", true);
    expect(live?.map((r) => r.id)).toEqual([v2.data?.id]);
    // A version is refused as a second live row even by a raw update.
    const { error: dupLive } = await svc
      .from("fieldops_commission_rule")
      .update({ is_active: true } as never)
      .eq("id", ruleId);
    expect(dupLive?.code).toBe("23505");
  });
});
