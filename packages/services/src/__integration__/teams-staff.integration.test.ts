import { ADMIN_PERMISSION_KEYS } from "@abonten/core/adminPermissions";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts, staff tools (docs/admin/teams.md): a team whose last
// Owner's account closed is paused and staff bring it back by making a
// member an Owner; staff pause a team in a dispute and resume it only with
// an Owner; clients cannot run the tools; a Verified team keeps its name.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appointTeamOwnerAdminCore,
  setTeamStatusAdminCore,
} from "../admin/teams/teamsAdminCore";
import {
  answerTeamInviteCore,
  createTeamCore,
  inviteTeamMemberCore,
  renameTeamCore,
} from "../teams/teamCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const noText = { canTextNumber: async () => false };

describe("staff tools for paused teams and disputes", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  const teamIds: string[] = [];
  let staff: TestUser;
  let ctx: AdminContext;

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `ts_${u.id.slice(0, 8)}`, full_name: "Staff Case" })
      .eq("id", u.id);
    return u;
  }

  async function teamWith(owner: TestUser, member: TestUser) {
    const made = await createTeamCore(svc, owner.id, {
      name: "Dispute Crew",
      username: `tsd_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamIds.push(made.data.id);
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId: made.data.id,
        role: "finance",
        target: { kind: "username", username: `ts_${member.id.slice(0, 8)}` },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    const res = await answerTeamInviteCore(svc, member.id, {
      inviteId: sent.data.id,
      action: "accept",
    });
    if (res.status !== 200) throw new Error(res.message);
    return made.data.id;
  }

  const statusOf = async (teamId: string) =>
    (
      await service
        .from("team")
        .select("status, status_reason")
        .eq("account_id", teamId)
        .single()
    ).data;

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    await service
      .from("team_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();
    staff = await person();
    ctx = {
      userId: staff.id,
      email: staff.email,
      roles: ["operations"],
      permissions: [...ADMIN_PERMISSION_KEYS],
      reauthenticatedAt: Date.now(),
    } as unknown as AdminContext;
  });

  afterAll(async () => {
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    await service.from("admin_audit_log").delete().eq("actor_id", staff.id);
    for (const id of teamIds) {
      await service.from("notification").delete().eq("user_id", id);
      await service.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("brings back a team whose last Owner's account closed", async () => {
    const owner = await person();
    const finance = await person();
    const teamId = await teamWith(owner, finance);

    // The Owner's account is banned: they leave the team, which pauses.
    await service.from("user_info").update({ status_id: 3 }).eq("id", owner.id);
    expect(await statusOf(teamId)).toEqual({
      status: "frozen",
      status_reason: "no_owner",
    });

    // Resuming needs an Owner first.
    const early = await setTeamStatusAdminCore(svc, ctx, {
      teamId,
      to: "active",
      reason: "Ticket 101: owner banned",
    });
    expect(early.status).toBe(409);

    const appointed = await appointTeamOwnerAdminCore(svc, ctx, {
      teamId,
      userId: finance.id,
      reason: "Ticket 101: finance member takes over",
    });
    expect(appointed.status).toBe(200);
    expect(appointed.data?.resumed).toBe(true);
    expect(await statusOf(teamId)).toEqual({
      status: "active",
      status_reason: null,
    });
    const { data: member } = await service
      .from("team_member")
      .select("role, status")
      .eq("team_id", teamId)
      .eq("user_id", finance.id)
      .single();
    expect(member).toEqual({ role: "owner", status: "active" });

    // A banned person is not made an Owner again.
    const banned = await appointTeamOwnerAdminCore(svc, ctx, {
      teamId,
      userId: owner.id,
      reason: "Ticket 101: try the banned owner",
    });
    expect(banned.status).toBe(409);

    const { data: audit } = await service
      .from("admin_audit_log")
      .select("action")
      .eq("actor_id", staff.id)
      .eq("target_id", teamId);
    expect((audit ?? []).map((a) => a.action)).toContain("teams.owner.appoint");
  });

  it("pauses a team in a dispute and resumes it; clients cannot", async () => {
    const owner = await person();
    const finance = await person();
    const teamId = await teamWith(owner, finance);

    const paused = await setTeamStatusAdminCore(svc, ctx, {
      teamId,
      to: "frozen",
      why: "dispute",
      reason: "Ticket 202: partners disagree",
    });
    expect(paused.status).toBe(200);
    expect(await statusOf(teamId)).toEqual({
      status: "frozen",
      status_reason: "dispute",
    });
    const twice = await setTeamStatusAdminCore(svc, ctx, {
      teamId,
      to: "frozen",
      why: "staff",
      reason: "Ticket 202: again",
    });
    expect(twice.status).toBe(409);

    const resumed = await setTeamStatusAdminCore(svc, ctx, {
      teamId,
      to: "active",
      reason: "Ticket 202: settled",
    });
    expect(resumed.status).toBe(200);
    expect((await statusOf(teamId))?.status).toBe("active");

    // Without teams.manage, nothing happens.
    const noRights = await setTeamStatusAdminCore(
      svc,
      { ...ctx, permissions: ["teams.view"] } as AdminContext,
      { teamId, to: "frozen", why: "staff", reason: "Not allowed here" },
    );
    expect(noRights.status).toBe(403);

    const { error } = await owner.client.rpc("admin_team_set_status", {
      p_team: teamId,
      p_to: "frozen",
      p_reason: "staff",
    } as never);
    expect(error?.code).toBe("42501");
  });

  it("keeps a Verified team's name", async () => {
    const owner = await person();
    const finance = await person();
    const teamId = await teamWith(owner, finance);
    await service
      .from("user_info")
      .update({
        organizer_verified: true,
        organizer_verified_at: new Date().toISOString(),
      })
      .eq("id", teamId);
    const res = await renameTeamCore(svc, owner.id, {
      teamId,
      name: "Another Name",
    });
    expect(res.status).toBe(409);
    await service
      .from("user_info")
      .update({ organizer_verified: false, organizer_verified_at: null })
      .eq("id", teamId);
    const ok = await renameTeamCore(svc, owner.id, {
      teamId,
      name: "Another Name",
    });
    expect(ok.status).toBe(200);
  });
});
