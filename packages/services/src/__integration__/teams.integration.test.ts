import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts, stage 1 (docs/architecture/team-accounts.md): making a
// team (its own sign-in-less account), invitations by username and by
// phone, roles, the last-Owner rule, leaving and removing, a member's
// account closing, acts_for() for later access rules, and that the apps
// cannot touch any team table.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const sms = vi.hoisted(() => ({ accept: false }));
vi.mock("../sms/hubtelSms", () => ({
  sendHubtelSms: async () =>
    sms.accept
      ? { ok: true, messageId: null }
      : { ok: false, reason: "unreachable", detail: "test" },
}));

import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import {
  answerTeamInviteCore,
  cancelTeamInviteCore,
  createTeamCore,
  getTeamCore,
  getTeamsOverviewCore,
  inviteTeamMemberCore,
  leaveTeamCore,
  removeTeamMemberCore,
  setTeamMemberRoleCore,
} from "../teams/teamCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const noText = { canTextNumber: async () => false };

describe("team accounts", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  const teams: string[] = [];

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `tm_${u.id.slice(0, 8)}`, full_name: "Team Person" })
      .eq("id", u.id);
    return u;
  }
  const handle = (u: TestUser) => `tm_${u.id.slice(0, 8)}`;

  async function setProgram(enabled: boolean) {
    await service
      .from("team_program_setting")
      .update({ enabled, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();
  }

  async function makeTeam(owner: TestUser): Promise<string> {
    const res = await createTeamCore(svc, owner.id, {
      name: "Night Collective",
      username: `tmt_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (res.status !== 200) throw new Error(res.message);
    teams.push(res.data.id);
    return res.data.id;
  }

  async function join(
    teamId: string,
    owner: TestUser,
    who: TestUser,
    role: "owner" | "finance" | "manager" | "content" | "door" | "front_desk",
  ) {
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      { teamId, role, target: { kind: "username", username: handle(who) } },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    const res = await answerTeamInviteCore(svc, who.id, {
      inviteId: sent.data.id,
      action: "accept",
    });
    if (res.status !== 200) throw new Error(res.message);
  }

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    await setProgram(true);
  });

  afterAll(async () => {
    await setProgram(false);
    for (const id of teams) {
      await service.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("ships switched off: no team while the programme is off", async () => {
    await setProgram(false);
    const owner = await person();
    const res = await createTeamCore(svc, owner.id, {
      name: "Off",
      username: `tmt_${crypto.randomUUID().slice(0, 8)}`,
    });
    expect(res.status).toBe(403);
    await setProgram(true);
  });

  it("makes a team as its own account that can never sign in, run by its maker", async () => {
    const owner = await person();
    const username = `tmt_${crypto.randomUUID().slice(0, 8)}`;
    const res = await createTeamCore(svc, owner.id, {
      name: "Echo Nights",
      username,
    });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    teams.push(res.data.id);
    expect(res.data.role).toBe("owner");

    const { data: profile } = await service
      .from("user_info")
      .select("account_kind, username, full_name")
      .eq("id", res.data.id)
      .single();
    expect(profile).toEqual({
      account_kind: "team",
      username,
      full_name: "Echo Nights",
    });
    const { data: auth } = await service.auth.admin.getUserById(res.data.id);
    expect(auth.user?.banned_until).toBeTruthy();

    const { data: log } = await service
      .from("team_activity")
      .select("action, actor_user_id")
      .eq("team_id", res.data.id);
    expect(log).toEqual([{ action: "team.created", actor_user_id: owner.id }]);

    // The handle is the team's now.
    const again = await createTeamCore(svc, owner.id, {
      name: "Copy",
      username,
    });
    expect(again.status).toBe(409);

    // A client can never make itself a team.
    const { error } = await owner.client
      .from("user_info")
      .update({ account_kind: "team" })
      .eq("id", owner.id);
    expect(error).not.toBeNull();
  });

  it("an invited person joins in the role they were given, and both sides are told", async () => {
    const owner = await person();
    const manager = await person();
    const teamId = await makeTeam(owner);

    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role: "manager",
        target: { kind: "username", username: `@${handle(manager)}` },
      },
      noText,
    );
    expect(sent.status).toBe(200);
    if (sent.status !== 200) return;
    expect(sent.data.to?.id).toBe(manager.id);

    const overview = await getTeamsOverviewCore(svc, manager.id);
    expect(overview.status).toBe(200);
    if (overview.status !== 200) return;
    expect(overview.data.invites.map((i) => i.id)).toContain(sent.data.id);

    // Only the person named answers.
    const stranger = await person();
    expect(
      (
        await answerTeamInviteCore(svc, stranger.id, {
          inviteId: sent.data.id,
          action: "accept",
        })
      ).status,
    ).toBe(404);

    const res = await answerTeamInviteCore(svc, manager.id, {
      inviteId: sent.data.id,
      action: "accept",
    });
    expect(res.status).toBe(200);

    const detail = await getTeamCore(svc, manager.id, teamId);
    expect(detail.status).toBe(200);
    if (detail.status !== 200) return;
    expect(detail.data.team.role).toBe("manager");
    expect(detail.data.members.map((m) => m.role).sort()).toEqual([
      "manager",
      "owner",
    ]);
    // A Manager does not see invitations or activity.
    expect(detail.data.invites).toBeNull();
    expect(detail.data.activity).toBeNull();

    const { data: notices } = await service
      .from("notification")
      .select("user_id, type")
      .in("type", ["team_invite_received", "team_invite_accepted"])
      .in("user_id", [owner.id, manager.id]);
    expect(notices).toEqual(
      expect.arrayContaining([
        { user_id: manager.id, type: "team_invite_received" },
        { user_id: owner.id, type: "team_invite_accepted" },
      ]),
    );
  });

  it("only an Owner invites, and nobody is invited twice or into a team they are in", async () => {
    const owner = await person();
    const manager = await person();
    const other = await person();
    const teamId = await makeTeam(owner);
    await join(teamId, owner, manager, "manager");

    const byManager = await inviteTeamMemberCore(
      svc,
      manager.id,
      {
        teamId,
        role: "door",
        target: { kind: "username", username: handle(other) },
      },
      noText,
    );
    expect(byManager.status).toBe(403);

    const first = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role: "door",
        target: { kind: "username", username: handle(other) },
      },
      noText,
    );
    expect(first.status).toBe(200);
    const twice = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role: "door",
        target: { kind: "username", username: handle(other) },
      },
      noText,
    );
    expect(twice.status).toBe(409);
    const member = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role: "door",
        target: { kind: "username", username: handle(manager) },
      },
      noText,
    );
    expect(member.status).toBe(409);
    const self = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role: "door",
        target: { kind: "username", username: handle(owner) },
      },
      noText,
    );
    expect(self.status).toBe(400);

    // A team cannot be invited into a team.
    const otherTeam = await makeTeam(other);
    const { data: teamProfile } = await service
      .from("user_info")
      .select("username")
      .eq("id", otherTeam)
      .single();
    const team = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role: "door",
        target: { kind: "username", username: teamProfile?.username ?? "" },
      },
      noText,
    );
    expect(team.status).toBe(404);

    // The Owner withdraws the waiting one; it can no longer be accepted.
    if (first.status !== 200) return;
    expect(
      (await cancelTeamInviteCore(svc, owner.id, first.data.id)).status,
    ).toBe(200);
    expect(
      (
        await answerTeamInviteCore(svc, other.id, {
          inviteId: first.data.id,
          action: "accept",
        })
      ).status,
    ).toBe(409);
  });

  it("a team always has an Owner: the last one can neither leave nor be demoted", async () => {
    const owner = await person();
    const second = await person();
    const teamId = await makeTeam(owner);

    expect((await leaveTeamCore(svc, owner.id, teamId)).status).toBe(409);
    expect(
      (
        await setTeamMemberRoleCore(svc, owner.id, {
          teamId,
          userId: owner.id,
          role: "manager",
        })
      ).status,
    ).toBe(409);
    expect(
      (await removeTeamMemberCore(svc, owner.id, { teamId, userId: owner.id }))
        .status,
    ).toBe(400);

    await join(teamId, owner, second, "content");
    expect(
      (
        await setTeamMemberRoleCore(svc, owner.id, {
          teamId,
          userId: second.id,
          role: "owner",
        })
      ).status,
    ).toBe(200);
    // Now there are two Owners: the first may leave.
    expect((await leaveTeamCore(svc, owner.id, teamId)).status).toBe(200);
    const left = await getTeamCore(svc, owner.id, teamId);
    expect(left.status).toBe(404);

    const { data: notices } = await service
      .from("notification")
      .select("type")
      .eq("user_id", second.id)
      .eq("type", "team_role_changed");
    expect(notices?.length).toBe(1);
  });

  it("an Owner removes a member and their access ends at once", async () => {
    const owner = await person();
    const door = await person();
    const teamId = await makeTeam(owner);
    await join(teamId, owner, door, "door");

    const { data: before } = await door.client.rpc("acts_for", {
      p_account: teamId,
      p_capability: "checkin.scan",
    });
    expect(before).toBe(true);

    expect(
      (await removeTeamMemberCore(svc, owner.id, { teamId, userId: door.id }))
        .status,
    ).toBe(200);
    const { data: after } = await door.client.rpc("acts_for", {
      p_account: teamId,
      p_capability: "checkin.scan",
    });
    expect(after).toBe(false);
    expect((await getTeamCore(svc, door.id, teamId)).status).toBe(404);
  });

  it("acts_for answers by role, for the signed-in person only", async () => {
    const owner = await person();
    const manager = await person();
    const door = await person();
    const outsider = await person();
    const teamId = await makeTeam(owner);
    await join(teamId, owner, manager, "manager");
    await join(teamId, owner, door, "door");

    const ask = async (who: TestUser, capability: string) =>
      (
        await who.client.rpc("acts_for", {
          p_account: teamId,
          p_capability: capability,
        })
      ).data;

    expect(await ask(owner, "payout.manage")).toBe(true);
    expect(await ask(manager, "events.manage")).toBe(true);
    expect(await ask(manager, "payout.manage")).toBe(false);
    expect(await ask(door, "checkin.scan")).toBe(true);
    expect(await ask(door, "attendees.view")).toBe(false);
    expect(await ask(outsider, "checkin.scan")).toBe(false);
    // Everyone acts for their own account.
    const { data: own } = await outsider.client.rpc("acts_for", {
      p_account: outsider.id,
      p_capability: "payout.manage",
    });
    expect(own).toBe(true);
  });

  it("invites a number with no account by text, and its verified owner accepts", async () => {
    const owner = await person();
    const teamId = await makeTeam(owner);
    const phone = `+23320${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;

    sms.accept = true;
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      { teamId, role: "front_desk", target: { kind: "phone", phone } },
      { canTextNumber: async () => true },
    );
    sms.accept = false;
    expect(sent.status).toBe(200);
    if (sent.status !== 200) return;
    expect(sent.data.to).toBeNull();
    expect(sent.data.toPhoneTexted).toBe(true);

    const newcomer = await person();
    await service.auth.admin.updateUserById(newcomer.id, {
      phone: phone.slice(1),
      phone_confirm: true,
    });
    const overview = await getTeamsOverviewCore(svc, newcomer.id);
    expect(
      overview.status === 200 && overview.data.invites.map((i) => i.id),
    ).toContain(sent.data.id);
    expect(
      (
        await answerTeamInviteCore(svc, newcomer.id, {
          inviteId: sent.data.id,
          action: "accept",
        })
      ).status,
    ).toBe(200);
  });

  it("a member whose account closes leaves every team; a team with no Owner left is paused", async () => {
    const owner = await person();
    const other = await person();
    const teamId = await makeTeam(owner);

    await service.from("user_info").update({ status_id: 4 }).eq("id", owner.id);

    const { data: team } = await service
      .from("team")
      .select("status, status_reason")
      .eq("account_id", teamId)
      .single();
    expect(team).toEqual({ status: "frozen", status_reason: "no_owner" });
    const { data: membership } = await service
      .from("team_member")
      .select("status")
      .eq("team_id", teamId)
      .eq("user_id", owner.id)
      .single();
    expect(membership?.status).toBe("removed");

    // Nobody acts for a paused team.
    const sent = await inviteTeamMemberCore(
      svc,
      other.id,
      {
        teamId,
        role: "door",
        target: { kind: "username", username: handle(other) },
      },
      noText,
    );
    expect(sent.status).not.toBe(200);
  });

  it("the apps cannot read team tables, call team functions or rewrite activity", async () => {
    const owner = await person();
    const teamId = await makeTeam(owner);

    const { data: rows, error: readError } = await owner.client
      .from("team_member")
      .select("*")
      .eq("team_id", teamId);
    expect(readError !== null || (rows ?? []).length === 0).toBe(true);

    const { error: rpcError } = await owner.client.rpc("team_member_leave", {
      p_team: teamId,
      p_user: owner.id,
    });
    expect(rpcError).not.toBeNull();

    const { error: rewrite } = await service
      .from("team_activity")
      .update({ action: "rewritten" })
      .eq("team_id", teamId);
    expect(rewrite).not.toBeNull();
  });

  it("invitations nobody answered run out", async () => {
    const owner = await person();
    const invitee = await person();
    const teamId = await makeTeam(owner);
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role: "content",
        target: { kind: "username", username: handle(invitee) },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    await service
      .from("team_invite")
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", sent.data.id);
    const { data: ended } = await service.rpc("team_invite_expire_due");
    expect(ended).toBeGreaterThanOrEqual(1);
    expect(
      (
        await answerTeamInviteCore(svc, invitee.id, {
          inviteId: sent.data.id,
          action: "accept",
        })
      ).status,
    ).toBe(409);
  });
});
