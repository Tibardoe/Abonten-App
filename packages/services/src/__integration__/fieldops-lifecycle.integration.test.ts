import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  setCampaignStatusCore,
  upsertCampaignCore,
} from "../admin/fieldOps/campaignsAdminCore";
import { upsertTerritoryCore } from "../admin/fieldOps/regionsAdminCore";
import { updateFieldOpsSettingsCore } from "../admin/fieldOps/settingsAdminCore";
import {
  addTeamMemberCore,
  setTeamMemberStatusCore,
} from "../admin/fieldOps/teamAdminCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Field Ops Phase 0: the campaign state machine as the database enforces it
// (fieldops_set_campaign_status), plus territory containment and phone
// invitations binding to the account that owns the phone.

const svc = getServiceClient() as ServiceRoleClient;

const ctxFor = (userId: string): AdminContext => ({
  userId,
  email: null,
  roles: ["field_ops_manager"],
  permissions: ["fieldops.view", "fieldops.manage", "fieldops.rules"],
  reauthenticatedAt: Date.now(),
});

let admin: TestUser;
let lead: TestUser;
let regionId: string;
let campaignId: string;

beforeAll(async () => {
  [admin, lead] = await Promise.all([createTestUser(svc), createTestUser(svc)]);
  const { data: region, error } = await svc
    .from("fieldops_region")
    .insert({
      name: `FieldOps lifecycle ${Date.now()}`,
      country_code: "GH",
    } as never)
    .select("id")
    .single();
  if (error || !region) throw new Error(error?.message);
  regionId = region.id;
  const { data: settings } = await svc
    .from("fieldops_program_setting")
    .select("updated_at")
    .eq("id", 1)
    .single();
  await updateFieldOpsSettingsCore(svc, ctxFor(admin.id), {
    patch: { requireMemberPhoneVerified: false },
    expectedUpdatedAt: settings?.updated_at as string,
    reason: "integration test",
  });
  const created = await upsertCampaignCore(svc, ctxFor(admin.id), {
    regionId,
    name: "Lifecycle campaign",
    currency: "GHS",
  });
  expect(created.status, created.message).toBe(200);
  campaignId = created.data?.id as string;
});

afterAll(async () => {
  await svc.from("fieldops_team_member").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_team").delete().eq("campaign_id", campaignId);
  await svc.from("fieldops_campaign").delete().eq("id", campaignId);
  await svc.from("fieldops_territory").delete().eq("region_id", regionId);
  await svc.from("fieldops_region").delete().eq("id", regionId);
  await Promise.all([admin, lead].map((u) => deleteTestUser(svc, u.id)));
});

describe("campaign lifecycle", () => {
  it("won't activate without a territory and a team lead, then walks the happy path", async () => {
    const ctx = ctxFor(admin.id);
    const noTerritory = await setCampaignStatusCore(svc, ctx, {
      campaignId,
      action: "activate",
      reason: "test",
    });
    expect(noTerritory.status).toBe(400);
    expect(noTerritory.message).toMatch(/territory/);

    const territory = await upsertTerritoryCore(svc, ctx, {
      regionId,
      name: "Ejisu",
      kind: "town",
      centre: { lat: 6.7208, lng: -1.3661 },
      radiusM: 4000,
    });
    expect(territory.status, territory.message).toBe(200);

    const noLead = await setCampaignStatusCore(svc, ctx, {
      campaignId,
      action: "activate",
      reason: "test",
    });
    expect(noLead.status).toBe(400);
    expect(noLead.message).toMatch(/team lead/);

    const added = await addTeamMemberCore(svc, ctx, {
      campaignId,
      role: "team_lead",
      userId: lead.id,
    });
    expect(added.status, added.message).toBe(200);

    const active = await setCampaignStatusCore(svc, ctx, {
      campaignId,
      action: "activate",
      reason: "test",
    });
    expect(active.status, active.message).toBe(200);
    expect(active.data?.status).toBe("active");

    // Invalid moves are refused by the TS table before the database.
    const skip = await setCampaignStatusCore(svc, ctx, {
      campaignId,
      action: "archive",
      reason: "test",
    });
    expect(skip.status).toBe(409);

    // And by the database even if the TS table were bypassed.
    const { error: raw } = await svc.rpc("fieldops_set_campaign_status", {
      p_campaign_id: campaignId,
      p_status: "archived",
      p_actor: admin.id,
    });
    expect(raw?.code).toBe("23514");

    for (const [action, expected] of [
      ["pause", "paused"],
      ["resume", "active"],
      ["wind_down", "winding_down"],
      ["complete", "completed"],
      ["archive", "archived"],
    ] as const) {
      const res = await setCampaignStatusCore(svc, ctx, {
        campaignId,
        action,
        reason: "test",
      });
      expect(res.status, `${action}: ${res.message}`).toBe(200);
      expect(res.data?.status).toBe(expected);
    }
    const { data: row } = await svc
      .from("fieldops_campaign")
      .select("status, activated_at, completed_at, archived_at")
      .eq("id", campaignId)
      .single();
    expect(row?.status).toBe("archived");
    expect(row?.activated_at).not.toBeNull();
    expect(row?.completed_at).not.toBeNull();
    expect(row?.archived_at).not.toBeNull();
  });

  it("allows one live campaign per region", async () => {
    const ctx = ctxFor(admin.id);
    const second = await upsertCampaignCore(svc, ctx, {
      regionId,
      name: "Second",
      currency: "GHS",
    });
    expect(second.status).toBe(200);
    const secondId = second.data?.id as string;
    // The lead left the archived campaign; add them to this one.
    await setTeamMemberStatusCore(svc, ctx, {
      memberId: (
        await svc
          .from("fieldops_team_member")
          .select("id")
          .eq("campaign_id", campaignId)
          .single()
      ).data?.id as string,
      status: "left",
      reason: "test",
    });
    await addTeamMemberCore(svc, ctx, {
      campaignId: secondId,
      role: "team_lead",
      userId: lead.id,
    });
    const a = await setCampaignStatusCore(svc, ctx, {
      campaignId: secondId,
      action: "activate",
      reason: "t",
    });
    expect(a.status, a.message).toBe(200);

    const third = await upsertCampaignCore(svc, ctx, {
      regionId,
      name: "Third",
      currency: "GHS",
    });
    const thirdId = third.data?.id as string;
    const { error } = await svc.rpc("fieldops_set_campaign_status", {
      p_campaign_id: thirdId,
      p_status: "active",
      p_actor: admin.id,
    });
    expect(error?.code, error?.message).toBe("23514"); // no lead on the third; the unique index is the second guard

    await svc
      .from("fieldops_team_member")
      .delete()
      .in("campaign_id", [secondId, thirdId]);
    await svc
      .from("fieldops_team")
      .delete()
      .in("campaign_id", [secondId, thirdId]);
    await svc.from("fieldops_campaign").delete().in("id", [secondId, thirdId]);
  });
});

describe("territories", () => {
  it("contains a point by polygon when set, else by radius", async () => {
    const ctx = ctxFor(admin.id);
    const circle = await upsertTerritoryCore(svc, ctx, {
      regionId,
      name: "Konongo",
      kind: "town",
      centre: { lat: 6.6167, lng: -1.2167 },
      radiusM: 3000,
    });
    expect(circle.status, circle.message).toBe(200);
    const inside = await svc.rpc("fieldops_territory_contains", {
      p_territory_id: circle.data?.id as string,
      p_lat: 6.62,
      p_lng: -1.22,
    });
    expect(inside.data).toBe(true);
    const outside = await svc.rpc("fieldops_territory_contains", {
      p_territory_id: circle.data?.id as string,
      p_lat: 6.6885,
      p_lng: -1.6244,
    });
    expect(outside.data).toBe(false);

    const polygon = await upsertTerritoryCore(svc, ctx, {
      id: circle.data?.id,
      regionId,
      name: "Konongo",
      kind: "town",
      centre: { lat: 6.6167, lng: -1.2167 },
      radiusM: 100,
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [-1.3, 6.55],
            [-1.1, 6.55],
            [-1.1, 6.7],
            [-1.3, 6.7],
            [-1.3, 6.55],
          ],
        ],
      },
    });
    expect(polygon.status, polygon.message).toBe(200);
    // Far outside the 100 m circle but inside the polygon.
    const inPolygon = await svc.rpc("fieldops_territory_contains", {
      p_territory_id: circle.data?.id as string,
      p_lat: 6.68,
      p_lng: -1.15,
    });
    expect(inPolygon.data).toBe(true);
    const bad = await upsertTerritoryCore(svc, ctx, {
      regionId,
      name: "Broken",
      kind: "town",
      centre: { lat: 6.6, lng: -1.2 },
      radiusM: 1000,
      boundary: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    });
    expect(bad.status).toBe(400);
  });
});

describe("phone invitations", () => {
  it("bind to the account that owns the verified phone, once", async () => {
    const ctx = ctxFor(admin.id);
    const phone = `+2335${String(Date.now()).slice(-8)}`;
    const invited = await addTeamMemberCore(svc, ctx, {
      campaignId,
      role: "online_member",
      invitedPhoneE164: phone,
      fullName: "Ama Invitee",
    });
    expect(invited.status, invited.message).toBe(200);
    expect(invited.data?.status).toBe("invited");

    const { data: created, error } = await svc.auth.admin.createUser({
      phone,
      phone_confirm: true,
    });
    if (error || !created.user) throw new Error(error?.message);
    try {
      const { data: bound } = await svc.rpc(
        "fieldops_bind_invited_memberships",
        {
          p_user_id: created.user.id,
        },
      );
      expect(bound).toBe(1);
      const { data: again } = await svc.rpc(
        "fieldops_bind_invited_memberships",
        {
          p_user_id: created.user.id,
        },
      );
      expect(again).toBe(0);
      const { data: row } = await svc
        .from("fieldops_team_member")
        .select("user_id, status, full_name_snapshot")
        .eq("id", invited.data?.id as string)
        .single();
      expect(row?.user_id).toBe(created.user.id);
      expect(row?.status).toBe("active");
      expect(row?.full_name_snapshot).toBe("Ama Invitee");
    } finally {
      await svc
        .from("fieldops_team_member")
        .delete()
        .eq("id", invited.data?.id as string);
      await svc.auth.admin.deleteUser(created.user.id);
    }
  });
});
