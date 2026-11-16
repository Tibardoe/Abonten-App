import { ADMIN_PERMISSION_KEYS } from "@abonten/core/adminPermissions";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts before everyone (docs/architecture/team-accounts.md §4m):
// the team terms an Owner accepts for the team (legal item N4) and the gate
// in Admin › Teams before "Everyone" (N4, N5, N9, K7 approved by counsel).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { updateTeamSettingsCore } from "../admin/teams/teamsAdminCore";
import {
  acceptTeamTermsCore,
  answerTeamInviteCore,
  createTeamCore,
  getTeamCore,
  inviteTeamMemberCore,
} from "../teams/teamCore";
import { requireTeamMoneyIdentity } from "../teams/teamMoney";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const noText = { canTextNumber: async () => false };
const VERSION = "2026-12-01";

describe("team terms and the gate before everyone", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  let ctx: AdminContext;
  const users: TestUser[] = [];
  const teamIds: string[] = [];

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `tt_${u.id.slice(0, 8)}`, full_name: "Terms Person" })
      .eq("id", u.id);
    return u;
  }

  async function settings(patch: Record<string, unknown>) {
    const { error } = await service
      .from("team_program_setting")
      .update(patch as never)
      .eq("id", 1);
    expect(error).toBeNull();
    resetTeamSettingsCache();
  }

  async function updatedAt(): Promise<string> {
    const { data } = await service
      .from("team_program_setting")
      .select("updated_at")
      .eq("id", 1)
      .single();
    return data?.updated_at as string;
  }

  const accepted = async (teamId: string) =>
    (await service.rpc("team_terms_accepted", { p_team: teamId })).data;

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    await settings({
      enabled: true,
      audience: "all",
      terms_version: null,
      launch_cleared_at: null,
      launch_cleared_by: null,
      launch_clearance: null,
    });
    const staff = await person();
    ctx = {
      userId: staff.id,
      email: staff.email,
      roles: ["operations"],
      permissions: [...ADMIN_PERMISSION_KEYS],
      reauthenticatedAt: Date.now(),
    } as unknown as AdminContext;
  });

  afterAll(async () => {
    await settings({
      enabled: false,
      audience: "all",
      terms_version: null,
      terms_path: "/legal/terms",
      launch_cleared_at: null,
      launch_cleared_by: null,
      launch_clearance: null,
    });
    for (const id of teamIds) {
      await service.from("notification").delete().eq("user_id", id);
      await service.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("asks Owners to accept published team terms for the team, and holds its money until one has (N4)", async () => {
    // Nothing published: nobody is asked, and money is not held.
    const owner = await person();
    const finance = await person();
    const before = await createTeamCore(svc, owner.id, {
      name: "Before Terms",
      username: `ttb_${crypto.randomUUID().slice(0, 8)}`,
      adult: true,
    });
    expect(before.status).toBe(200);
    if (before.status !== 200) return;
    const teamId = before.data.id;
    teamIds.push(teamId);
    expect(await accepted(teamId)).toBe(true);
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role: "finance",
        target: { kind: "username", username: `tt_${finance.id.slice(0, 8)}` },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    await answerTeamInviteCore(svc, finance.id, {
      inviteId: sent.data.id,
      action: "accept",
      adult: true,
    });
    const financeActor = {
      personId: finance.id,
      accountId: teamId,
      role: "finance" as const,
    };
    expect(await requireTeamMoneyIdentity(svc, financeActor)).toBeNull();

    // Published: a new team accepts them as it is made, in the request's
    // language; a missing or stale version is refused.
    await settings({
      terms_version: VERSION,
      terms_path: "/legal/terms#team-accounts",
    });
    const maker = await person();
    const name = () => `tta_${crypto.randomUUID().slice(0, 8)}`;
    const missing = await createTeamCore(svc, maker.id, {
      name: "After Terms",
      username: name(),
      adult: true,
    });
    expect(missing.status).toBe(400);
    const stale = await createTeamCore(svc, maker.id, {
      name: "After Terms",
      username: name(),
      adult: true,
      termsVersion: "2026-01-01",
    });
    expect(stale.status).toBe(409);
    const made = await createTeamCore(svc, maker.id, {
      name: "After Terms",
      username: name(),
      adult: true,
      termsVersion: VERSION,
    });
    expect(made.status, made.message).toBe(200);
    if (made.status !== 200) return;
    teamIds.push(made.data.id);
    const { data: record } = await service
      .from("team_terms_acceptance")
      .select("user_id, terms_version, locale")
      .eq("team_id", made.data.id)
      .single();
    expect(record).toMatchObject({
      user_id: maker.id,
      terms_version: VERSION,
    });
    expect(record?.locale).toBeTruthy();
    expect(await accepted(made.data.id)).toBe(true);

    // The team made before: its money waits, and the page asks its Owner.
    expect(await accepted(teamId)).toBe(false);
    expect((await requireTeamMoneyIdentity(svc, financeActor))?.status).toBe(
      409,
    );
    const page = await getTeamCore(svc, owner.id, teamId);
    expect(page.status === 200 && page.data.terms).toMatchObject({
      version: VERSION,
      path: "/legal/terms#team-accounts",
      acceptedByMe: false,
      acceptedByAnOwner: false,
    });

    // Only an Owner accepts, and only the current version.
    expect(
      (
        await acceptTeamTermsCore(svc, finance.id, {
          teamId,
          termsVersion: VERSION,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await acceptTeamTermsCore(svc, owner.id, {
          teamId,
          termsVersion: "2025-01-01",
        })
      ).status,
    ).toBe(409);
    const ok = await acceptTeamTermsCore(svc, owner.id, {
      teamId,
      termsVersion: VERSION,
    });
    expect(ok.status, ok.message).toBe(200);
    expect(await accepted(teamId)).toBe(true);
    expect(await requireTeamMoneyIdentity(svc, financeActor)).toBeNull();
    const { data: logged } = await service
      .from("team_activity")
      .select("actor_user_id")
      .eq("team_id", teamId)
      .eq("action", "terms_accepted")
      .single();
    expect(logged?.actor_user_id).toBe(owner.id);

    // An acceptance is evidence: it is never rewritten.
    const { error: rewrite } = await service
      .from("team_terms_acceptance")
      .update({ terms_version: "forged" })
      .eq("team_id", teamId);
    expect(rewrite?.message).toMatch(/append-only/);

    // A new version asks again.
    await settings({ terms_version: "2027-01-01" });
    expect(await accepted(teamId)).toBe(false);
    await settings({ terms_version: VERSION });
  });

  it("opens to everyone only with published terms and counsel's approval recorded", async () => {
    await settings({
      enabled: true,
      audience: "staff",
      terms_version: null,
      launch_cleared_at: null,
      launch_cleared_by: null,
      launch_clearance: null,
    });
    const noTerms = await updateTeamSettingsCore(svc, ctx, {
      expectedUpdatedAt: await updatedAt(),
      reason: "Open to everyone",
      patch: { audience: "all" },
      confirmLaunchClearance: true,
    });
    expect(noTerms.status).toBe(400);

    const notCleared = await updateTeamSettingsCore(svc, ctx, {
      expectedUpdatedAt: await updatedAt(),
      reason: "Open to everyone",
      patch: { audience: "all", termsVersion: VERSION },
    });
    expect(notCleared.status).toBe(400);

    const opened = await updateTeamSettingsCore(svc, ctx, {
      expectedUpdatedAt: await updatedAt(),
      reason: "Counsel approved N4 N5 N9 K7",
      patch: { audience: "all", termsVersion: VERSION },
      confirmLaunchClearance: true,
    });
    expect(opened.status, opened.message).toBe(200);
    expect(opened.data).toMatchObject({
      audience: "all",
      termsVersion: VERSION,
      launchClearedBy: ctx.userId,
    });
    const { data: row } = await service
      .from("team_program_setting")
      .select("launch_clearance")
      .eq("id", 1)
      .single();
    expect(row?.launch_clearance).toMatchObject({
      items: ["N4", "N5", "N9", "K7"],
    });

    // Taking the terms away while open to everyone is refused.
    const withdrawn = await updateTeamSettingsCore(svc, ctx, {
      expectedUpdatedAt: await updatedAt(),
      reason: "Remove the terms",
      patch: { termsVersion: null },
    });
    expect(withdrawn.status).toBe(400);
  });
});
