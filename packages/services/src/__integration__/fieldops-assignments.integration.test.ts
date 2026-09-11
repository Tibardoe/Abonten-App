import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  setCampaignStatusCore,
  upsertCampaignCore,
} from "../admin/fieldOps/campaignsAdminCore";
import { upsertTerritoryCore } from "../admin/fieldOps/regionsAdminCore";
import { updateFieldOpsSettingsCore } from "../admin/fieldOps/settingsAdminCore";
import { addTeamMemberCore } from "../admin/fieldOps/teamAdminCore";
import { sendAnnouncementCore } from "../fieldOps/lead/announceCore";
import {
  cancelAssignmentCore,
  createAssignmentCore,
  listLeadAssignmentsCore,
} from "../fieldOps/lead/leadAssignmentsCore";
import { getLeadDashboardCore } from "../fieldOps/lead/leadDashboardQuery";
import {
  inviteTeamMemberCore,
  setLeadMemberStatusCore,
} from "../fieldOps/lead/leadTeamCore";
import { upsertLeadTerritoryCore } from "../fieldOps/lead/leadTerritoriesCore";
import {
  completeAssignmentCore,
  listMyAssignmentsCore,
  startAssignmentCore,
} from "../fieldOps/member/assignmentsCore";
import { getMyFieldOpsCore } from "../fieldOps/member/myFieldOpsQuery";
import {
  createProspectCore,
  getTerritoryViewCore,
  updateProspectCore,
} from "../fieldOps/member/prospectsCore";
import { todayIso } from "../fieldOps/shared/fieldOpsRows";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Field Ops Phase 1: assignments and prospects.
//
//   * only the team lead plans; a member creating an assignment is refused
//   * one open assignment per member per territory; reassignment keeps history
//   * a member sees only their own rows under RLS, the lead sees the team's,
//     a lead of another campaign sees and changes nothing
//   * start needs an active campaign (and GPS for offline work); complete
//     needs a started assignment
//   * prospects need an open assignment in that territory; contact attempts
//     move the status
//   * suspending a member cancels their open assignments; announcements
//     reach every active member but the sender

const svc = getServiceClient() as ServiceRoleClient;

const adminCtx = (userId: string): AdminContext => ({
  userId,
  email: null,
  roles: ["field_ops_manager"],
  permissions: ["fieldops.view", "fieldops.manage"],
  reauthenticatedAt: Date.now(),
});

let admin: TestUser;
let lead: TestUser;
let offline: TestUser;
let online: TestUser;
let otherLead: TestUser;
let regionId: string;
let otherRegionId: string;
let campaignId: string;
let otherCampaignId: string;
let territoryId: string;
let offlineMemberId: string;
let onlineMemberId: string;
let settingsUpdatedAt: string;

const today = todayIso();

beforeAll(async () => {
  [admin, lead, offline, online, otherLead] = await Promise.all([
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
    createTestUser(svc),
  ]);
  for (const u of [lead, offline, online, otherLead]) {
    await svc
      .from("user_info")
      .update({ full_name: `Tester ${u.id.slice(0, 6)}` } as never)
      .eq("id", u.id);
  }
  const ctx = adminCtx(admin.id);
  const { data: settings } = await svc
    .from("fieldops_program_setting")
    .select("updated_at")
    .eq("id", 1)
    .single();
  const updated = await updateFieldOpsSettingsCore(svc, ctx, {
    patch: { programEnabled: true, requireMemberPhoneVerified: false },
    expectedUpdatedAt: settings?.updated_at as string,
    reason: "integration test",
  });
  expect(updated.status, updated.message).toBe(200);
  settingsUpdatedAt = updated.data?.updatedAt as string;

  const suffix = Date.now();
  const mkRegion = async (name: string) => {
    const { data, error } = await svc
      .from("fieldops_region")
      .insert({ name, country_code: "GH" } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message);
    return data.id as string;
  };
  regionId = await mkRegion(`FieldOps assignments ${suffix}`);
  otherRegionId = await mkRegion(`FieldOps assignments other ${suffix}`);

  const mkCampaign = async (
    region: string,
    name: string,
    leadUser: TestUser,
  ) => {
    const created = await upsertCampaignCore(svc, ctx, {
      regionId: region,
      name,
      currency: "GHS",
    });
    expect(created.status, created.message).toBe(200);
    const id = created.data?.id as string;
    const t = await upsertTerritoryCore(svc, ctx, {
      regionId: region,
      name: "Ejisu",
      kind: "town",
      centre: { lat: 6.7208, lng: -1.3661 },
      radiusM: 4000,
    });
    expect(t.status, t.message).toBe(200);
    const l = await addTeamMemberCore(svc, ctx, {
      campaignId: id,
      role: "team_lead",
      userId: leadUser.id,
    });
    expect(l.status, l.message).toBe(200);
    return { id, territoryId: t.data?.id as string };
  };
  const main = await mkCampaign(regionId, "Assignments campaign", lead);
  campaignId = main.id;
  territoryId = main.territoryId;
  const other = await mkCampaign(otherRegionId, "Other campaign", otherLead);
  otherCampaignId = other.id;

  for (const [user, role] of [
    [offline, "offline_member"],
    [online, "online_member"],
  ] as const) {
    const m = await addTeamMemberCore(svc, ctx, {
      campaignId,
      role,
      userId: user.id,
    });
    expect(m.status, m.message).toBe(200);
    if (role === "offline_member") offlineMemberId = m.data?.id as string;
    else onlineMemberId = m.data?.id as string;
  }
  for (const id of [campaignId, otherCampaignId]) {
    const active = await setCampaignStatusCore(svc, ctx, {
      campaignId: id,
      action: "activate",
      reason: "test",
    });
    expect(active.status, active.message).toBe(200);
  }
});

afterAll(async () => {
  const ids = [campaignId, otherCampaignId].filter(Boolean);
  await svc.from("fieldops_prospect").delete().in("campaign_id", ids);
  await svc.from("fieldops_assignment").delete().in("campaign_id", ids);
  await svc.from("fieldops_team_member").delete().in("campaign_id", ids);
  await svc.from("fieldops_team").delete().in("campaign_id", ids);
  await svc.from("fieldops_campaign").delete().in("id", ids);
  await svc
    .from("fieldops_territory")
    .delete()
    .in("region_id", [regionId, otherRegionId]);
  await svc
    .from("fieldops_region")
    .delete()
    .in("id", [regionId, otherRegionId]);
  await updateFieldOpsSettingsCore(svc, adminCtx(admin.id), {
    patch: { programEnabled: false, requireMemberPhoneVerified: true },
    expectedUpdatedAt: settingsUpdatedAt,
    reason: "integration test cleanup",
  });
  await Promise.all(
    [admin, lead, offline, online, otherLead].map((u) =>
      deleteTestUser(svc, u.id),
    ),
  );
});

describe("planning", () => {
  it("only the team lead creates assignments; the member sees theirs on /field", async () => {
    const refused = await createAssignmentCore(svc, offline.id, {
      campaignId,
      memberId: offlineMemberId,
      territoryId,
      startsOn: today,
      endsOn: today,
    });
    expect(refused.status).toBe(403);

    const foreign = await createAssignmentCore(svc, otherLead.id, {
      campaignId,
      memberId: offlineMemberId,
      territoryId,
      startsOn: today,
      endsOn: today,
    });
    expect(foreign.status).toBe(403);

    const created = await createAssignmentCore(svc, lead.id, {
      campaignId,
      memberId: offlineMemberId,
      territoryId,
      startsOn: today,
      endsOn: today,
      notes: "Start at the market",
    });
    expect(created.status, created.message).toBe(200);
    expect(created.data?.mode).toBe("offline");
    expect(created.data?.memberName).toMatch(/^Tester/);

    const me = await getMyFieldOpsCore(svc, offline.id);
    expect(me.status).toBe(200);
    expect(me.data?.current?.campaign.id).toBe(campaignId);
    expect(me.data?.current?.todayAssignments.map((a) => a.id)).toEqual([
      created.data?.id,
    ]);
    expect(me.data?.current?.stats.openAssignments).toBe(1);

    const { data: notice } = await svc
      .from("notification")
      .select("type, data")
      .eq("user_id", offline.id)
      .eq("type", "fieldops_assignment_created")
      .maybeSingle();
    expect(notice?.type).toBe("fieldops_assignment_created");
    expect((notice?.data as { kind?: string })?.kind).toBe("fieldops");
  });

  it("allows one open assignment per member per territory; reassignment keeps history", async () => {
    const dup = await createAssignmentCore(svc, lead.id, {
      campaignId,
      memberId: offlineMemberId,
      territoryId,
      startsOn: today,
      endsOn: today,
    });
    expect(dup.status).toBe(409);
    expect(dup.message).toMatch(/already has an open assignment/);

    const list = await listLeadAssignmentsCore(svc, lead.id, {
      campaignId,
      date: today,
    });
    const first = list.data?.[0];
    expect(first?.status).toBe("assigned");

    const cancelled = await cancelAssignmentCore(svc, lead.id, {
      campaignId,
      assignmentId: first?.id as string,
      reason: "Moving them to the morning shift",
    });
    expect(cancelled.status, cancelled.message).toBe(200);
    expect(cancelled.data?.status).toBe("cancelled");

    const again = await createAssignmentCore(svc, lead.id, {
      campaignId,
      memberId: offlineMemberId,
      territoryId,
      startsOn: today,
      endsOn: today,
    });
    expect(again.status, again.message).toBe(200);

    const history = await listMyAssignmentsCore(svc, offline.id, {
      campaignId,
    });
    expect(history.data?.map((a) => a.status).sort()).toEqual([
      "assigned",
      "cancelled",
    ]);
  });

  it("refuses the wrong role, a past end date and a foreign territory at the database", async () => {
    const past = await createAssignmentCore(svc, lead.id, {
      campaignId,
      memberId: onlineMemberId,
      territoryId,
      startsOn: "2020-01-01",
      endsOn: "2020-01-02",
    });
    expect(past.status).toBe(400);

    const { data: leadRow } = await svc
      .from("fieldops_team_member")
      .select("id, team_id")
      .eq("campaign_id", campaignId)
      .eq("role", "team_lead")
      .single();
    const { error: roleErr } = await svc.from("fieldops_assignment").insert({
      campaign_id: campaignId,
      team_id: leadRow?.team_id,
      member_id: leadRow?.id,
      member_user_id: lead.id,
      territory_id: territoryId,
      mode: "offline",
      starts_on: today,
      ends_on: today,
    } as never);
    expect(roleErr?.code).toBe("23514");

    const { data: otherTerritory } = await svc
      .from("fieldops_territory")
      .select("id")
      .eq("region_id", otherRegionId)
      .single();
    const { error: regionErr } = await svc.from("fieldops_assignment").insert({
      campaign_id: campaignId,
      team_id: leadRow?.team_id,
      member_id: onlineMemberId,
      member_user_id: online.id,
      territory_id: otherTerritory?.id,
      mode: "online",
      starts_on: today,
      ends_on: today,
    } as never);
    expect(regionErr?.code).toBe("23514");
  });
});

describe("row visibility", () => {
  it("members see only their own rows; the lead sees the team; another campaign's lead sees nothing; nobody writes", async () => {
    const onlineAssignment = await createAssignmentCore(svc, lead.id, {
      campaignId,
      memberId: onlineMemberId,
      territoryId,
      startsOn: today,
      endsOn: today,
    });
    expect(onlineAssignment.status, onlineAssignment.message).toBe(200);

    const { data: mine } = await offline.client
      .from("fieldops_assignment")
      .select("id, member_user_id")
      .eq("campaign_id", campaignId);
    expect(mine?.length).toBeGreaterThan(0);
    expect(mine?.every((a) => a.member_user_id === offline.id)).toBe(true);

    const { data: teams } = await lead.client
      .from("fieldops_assignment")
      .select("member_user_id")
      .eq("campaign_id", campaignId);
    expect(new Set(teams?.map((a) => a.member_user_id))).toEqual(
      new Set([offline.id, online.id]),
    );

    const { data: foreign } = await otherLead.client
      .from("fieldops_assignment")
      .select("id")
      .eq("campaign_id", campaignId);
    expect(foreign).toEqual([]);

    const { error: write } = await offline.client
      .from("fieldops_assignment")
      .update({ status: "completed" } as never)
      .eq("campaign_id", campaignId);
    expect(write?.code).toBe("42501");
    const { error: insert } = await lead.client
      .from("fieldops_prospect")
      .insert({ name: "nope" } as never);
    expect(insert?.code).toBe("42501");
  });
});

describe("working an assignment", () => {
  it("starts with GPS for offline work, refuses a second start, then completes", async () => {
    const list = await listMyAssignmentsCore(svc, offline.id, {
      campaignId,
      status: "assigned",
    });
    const id = list.data?.[0]?.id as string;
    expect(id).toBeTruthy();

    const noGps = await startAssignmentCore(svc, offline.id, {
      campaignId,
      assignmentId: id,
    });
    expect(noGps.status).toBe(400);

    const notMine = await startAssignmentCore(svc, online.id, {
      campaignId,
      assignmentId: id,
      location: { lat: 6.72, lng: -1.36 },
    });
    expect(notMine.status).toBe(404);

    const started = await startAssignmentCore(svc, offline.id, {
      campaignId,
      assignmentId: id,
      location: { lat: 6.7308, lng: -1.3661 },
      accuracyM: 12.4,
    });
    expect(started.status, started.message).toBe(200);
    expect(started.data?.status).toBe("started");
    expect(started.data?.startAccuracyM).toBe(12);
    // ~1.1 km north of the centre.
    expect(started.data?.startDistanceM).toBeGreaterThan(1000);
    expect(started.data?.startDistanceM).toBeLessThan(1300);

    const twice = await startAssignmentCore(svc, offline.id, {
      campaignId,
      assignmentId: id,
      location: { lat: 6.72, lng: -1.36 },
    });
    expect(twice.status).toBe(409);

    const done = await completeAssignmentCore(svc, offline.id, {
      campaignId,
      assignmentId: id,
    });
    expect(done.status, done.message).toBe(200);
    expect(done.data?.status).toBe("completed");
  });

  it("won't start while the campaign is paused", async () => {
    const ctx = adminCtx(admin.id);
    const paused = await setCampaignStatusCore(svc, ctx, {
      campaignId,
      action: "pause",
      reason: "test",
    });
    expect(paused.status, paused.message).toBe(200);
    try {
      const list = await listMyAssignmentsCore(svc, online.id, {
        campaignId,
        status: "assigned",
      });
      const res = await startAssignmentCore(svc, online.id, {
        campaignId,
        assignmentId: list.data?.[0]?.id as string,
      });
      expect(res.status).toBe(409);
      expect(res.message).toMatch(/paused/);
    } finally {
      const resumed = await setCampaignStatusCore(svc, ctx, {
        campaignId,
        action: "resume",
        reason: "test",
      });
      expect(resumed.status, resumed.message).toBe(200);
    }
  });
});

describe("prospects", () => {
  it("need an open assignment in the territory; contact attempts move the status; the lead sees them masked", async () => {
    // The offline member completed their assignment above: no open one now.
    const refused = await createProspectCore(svc, offline.id, {
      campaignId,
      territoryId,
      kind: "place",
      name: "Auntie Ama's Chop Bar",
    });
    expect(refused.status).toBe(409);

    // The online member still has an open (assigned) one.
    const created = await createProspectCore(svc, online.id, {
      campaignId,
      territoryId,
      kind: "place",
      name: "Auntie Ama's Chop Bar",
      contactPhoneE164: "+233241234567",
      contactChannel: "whatsapp",
    });
    expect(created.status, created.message).toBe(200);
    expect(created.data?.status).toBe("identified");
    expect(created.data?.contactPhoneMasked).toBe("+233241234567");

    const contacted = await updateProspectCore(svc, online.id, {
      campaignId,
      prospectId: created.data?.id as string,
      contactAttempt: { channel: "phone", outcome: "call_back" },
    });
    expect(contacted.status, contacted.message).toBe(200);
    expect(contacted.data?.status).toBe("contacted");
    expect(contacted.data?.contactAttempts).toHaveLength(1);

    const interested = await updateProspectCore(svc, online.id, {
      campaignId,
      prospectId: created.data?.id as string,
      contactAttempt: { channel: "whatsapp", outcome: "interested" },
    });
    expect(interested.data?.status).toBe("interested");

    const notMine = await updateProspectCore(svc, offline.id, {
      campaignId,
      prospectId: created.data?.id as string,
      status: "declined",
    });
    expect(notMine.status).toBe(404);

    const leadView = await getTerritoryViewCore(svc, lead.id, {
      campaignId,
      territoryId,
    });
    expect(leadView.status, leadView.message).toBe(200);
    expect(leadView.data?.canAddProspects).toBe(false);
    expect(leadView.data?.prospects).toHaveLength(1);
    expect(leadView.data?.prospects[0]?.contactPhoneMasked).not.toBe(
      "+233241234567",
    );
    expect(leadView.data?.prospects[0]?.contactPhoneMasked).toMatch(/\*/);

    const offlineView = await getTerritoryViewCore(svc, offline.id, {
      campaignId,
      territoryId,
    });
    expect(offlineView.data?.prospects).toEqual([]);

    const foreignView = await getTerritoryViewCore(svc, otherLead.id, {
      campaignId,
      territoryId,
    });
    expect(foreignView.status).toBe(403);
  });
});

describe("lead dashboard, territories, team and announcements", () => {
  it("computes coverage from open assignments and lets the lead add territories in their region only", async () => {
    const before = await getLeadDashboardCore(svc, lead.id, campaignId);
    expect(before.status, before.message).toBe(200);
    expect(before.data?.territories[0]?.coverage).toBe("covered");
    expect(before.data?.coveragePct).toBe(100);
    expect(before.data?.assignableMembers.map((m) => m.id).sort()).toEqual(
      [offlineMemberId, onlineMemberId].sort(),
    );

    const added = await upsertLeadTerritoryCore(svc, lead.id, {
      campaignId,
      name: "Konongo",
      kind: "town",
      centre: { lat: 6.6167, lng: -1.2167 },
      radiusM: 3000,
    });
    expect(added.status, added.message).toBe(200);
    expect(added.data?.regionId).toBe(regionId);

    const after = await getLeadDashboardCore(svc, lead.id, campaignId);
    expect(after.data?.coveragePct).toBe(50);

    const foreign = await upsertLeadTerritoryCore(svc, lead.id, {
      campaignId,
      id: (
        await svc
          .from("fieldops_territory")
          .select("id")
          .eq("region_id", otherRegionId)
          .single()
      ).data?.id,
      name: "Hijack",
      kind: "town",
      centre: { lat: 6.6, lng: -1.2 },
      radiusM: 3000,
    });
    expect(foreign.status).toBe(404);

    const member = await getLeadDashboardCore(svc, offline.id, campaignId);
    expect(member.status).toBe(403);
  });

  it("invites by phone (binding at once when the phone has an account), never a lead; suspending cancels open work", async () => {
    const asLead = await inviteTeamMemberCore(svc, lead.id, {
      campaignId,
      role: "team_lead" as never,
      invitedPhoneE164: "+233200000001",
      fullName: "Nope",
    });
    expect(asLead.status).toBe(403);

    const phone = `+2335${String(Date.now()).slice(-8)}`;
    const invited = await inviteTeamMemberCore(svc, lead.id, {
      campaignId,
      role: "online_member",
      invitedPhoneE164: phone,
      fullName: "Kofi Invitee",
    });
    expect(invited.status, invited.message).toBe(200);
    expect(invited.data?.status).toBe("invited");
    expect(invited.data?.invitedPhoneMasked).toMatch(/\*/);

    const dup = await inviteTeamMemberCore(svc, lead.id, {
      campaignId,
      role: "offline_member",
      invitedPhoneE164: phone,
      fullName: "Kofi Invitee",
    });
    expect(dup.status).toBe(409);

    // Suspending the online member cancels their open assignment.
    const suspended = await setLeadMemberStatusCore(svc, lead.id, {
      campaignId,
      memberId: onlineMemberId,
      status: "suspended",
      reason: "No-show two days running",
    });
    expect(suspended.status, suspended.message).toBe(200);
    const { data: rows } = await svc
      .from("fieldops_assignment")
      .select("status")
      .eq("member_id", onlineMemberId);
    expect(
      rows?.every((r) => r.status !== "assigned" && r.status !== "started"),
    ).toBe(true);

    // A suspended member can't act.
    const blocked = await listMyAssignmentsCore(svc, online.id, { campaignId });
    expect(blocked.status).toBe(403);

    const leadRow = await svc
      .from("fieldops_team_member")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("role", "team_lead")
      .single();
    const self = await setLeadMemberStatusCore(svc, lead.id, {
      campaignId,
      memberId: leadRow.data?.id as string,
      status: "left",
      reason: "test",
    });
    expect(self.status).toBe(403);

    const reactivated = await setLeadMemberStatusCore(svc, lead.id, {
      campaignId,
      memberId: onlineMemberId,
      status: "active",
      reason: "Back on the team",
    });
    expect(reactivated.status, reactivated.message).toBe(200);
  });

  it("announces to every active member except the sender", async () => {
    const sent = await sendAnnouncementCore(svc, lead.id, {
      campaignId,
      title: "Meet at 8am",
      body: "Lorry station, bring the flyers.",
    });
    expect(sent.status, sent.message).toBe(200);
    expect(sent.data?.recipients).toBe(2);
    const { data: notices } = await svc
      .from("notification")
      .select("user_id")
      .eq("type", "fieldops_announcement")
      .eq("title", "Meet at 8am");
    expect(new Set(notices?.map((n) => n.user_id))).toEqual(
      new Set([offline.id, online.id]),
    );

    const member = await sendAnnouncementCore(svc, offline.id, {
      campaignId,
      title: "Nope",
      body: "Nope nope",
    });
    expect(member.status).toBe(403);
  });
});
