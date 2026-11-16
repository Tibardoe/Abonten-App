import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts, the business check (docs/architecture/team-accounts.md §4h,
// decision X42): a team's Owners ask for its verification; the request is
// the team's and needs a registered business with its registration and a
// paper showing the Owner may act for it; other roles cannot act on it; a
// paused team is not approved; a Verified team that changes its name goes
// back to review and its Owners are told; "ID checked" on a team means one
// of its Owners passed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setTeamStatusAdminCore } from "../admin/teams/teamsAdminCore";
import {
  answerTeamInviteCore,
  createTeamCore,
  inviteTeamMemberCore,
  renameTeamCore,
} from "../teams/teamCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  getSubjectVerificationCore,
  startVerificationCaseCore,
  submitVerificationCaseCore,
  withdrawVerificationCaseCore,
} from "../verification/verificationCaseCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const noText = { canTextNumber: async () => false };

describe("verification for teams (the business check, X42)", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  const teamIds: string[] = [];
  let staff: TestUser;
  let verificationBefore: Record<string, unknown> | null = null;

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `tv_${u.id.slice(0, 8)}`, full_name: "Team Case" })
      .eq("id", u.id);
    return u;
  }

  async function teamWith(owner: TestUser, member: TestUser, role: string) {
    const made = await createTeamCore(svc, owner.id, {
      adult: true,
      name: "Osu Lounge Ltd",
      username: `tvt_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamIds.push(made.data.id);
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId: made.data.id,
        role: role as "manager",
        target: { kind: "username", username: `tv_${member.id.slice(0, 8)}` },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    const res = await answerTeamInviteCore(svc, member.id, {
      adult: true,
      inviteId: sent.data.id,
      action: "accept",
    });
    if (res.status !== 200) throw new Error(res.message);
    return made.data.id;
  }

  async function addDocument(caseId: string, owner: string, type: string) {
    const { error } = await service.from("verification_evidence").insert({
      case_id: caseId,
      evidence_type: type,
      storage_path: `organizer/test/${caseId}/${crypto.randomUUID()}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 1000,
      status: "uploaded",
      uploaded_by: owner,
      uploaded_at: new Date().toISOString(),
    } as never);
    if (error) throw new Error(error.message);
  }

  const approve = (caseId: string) =>
    service.rpc("verification_transition", {
      p_case_id: caseId,
      p_actor_id: staff.id,
      p_actor_kind: "admin",
      p_action: "approve",
    });

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    await service
      .from("team_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();
    const { data } = await service
      .from("verification_program_setting")
      .select("*")
      .eq("id", 1)
      .single();
    verificationBefore = data as Record<string, unknown> | null;
    await service
      .from("verification_program_setting")
      .update({
        organizer_requests_enabled: true,
        place_requests_enabled: true,
        audience: "all",
      } as never)
      .eq("id", 1);
    staff = await person();
  });

  afterAll(async () => {
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    if (verificationBefore) {
      await service
        .from("verification_program_setting")
        .update({
          organizer_requests_enabled:
            verificationBefore.organizer_requests_enabled,
          place_requests_enabled: verificationBefore.place_requests_enabled,
          audience: verificationBefore.audience,
        } as never)
        .eq("id", 1);
    }
    await service.from("admin_audit_log").delete().eq("actor_id", staff.id);
    for (const id of teamIds) {
      await service.from("notification").delete().eq("user_id", id);
      await service.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("lets Owners ask for the team, with the business check's papers", async () => {
    const owner = await person();
    const manager = await person();
    const teamId = await teamWith(owner, manager, "manager");

    // A team is a business, never an individual.
    const individual = await startVerificationCaseCore(
      svc,
      teamId,
      {
        subjectType: "organizer",
        subjectId: teamId,
        organizerType: "individual",
      },
      owner.id,
    );
    expect(individual.status).toBe(400);

    const view = await getSubjectVerificationCore(
      svc,
      teamId,
      { subjectType: "organizer", subjectId: teamId },
      owner.id,
    );
    expect(view.status).toBe(200);
    expect(view.data?.team).toBe(true);
    expect(view.data?.program.organizerTypes).not.toContain("individual");

    const started = await startVerificationCaseCore(
      svc,
      teamId,
      {
        subjectType: "organizer",
        subjectId: teamId,
        organizerType: "business",
      },
      owner.id,
    );
    expect(started.status, started.message).toBe(200);
    const caseId = started.data?.caseId as string;
    const { data: row } = await service
      .from("verification_case")
      .select("requester_id, requested_by, organizer_user_id")
      .eq("id", caseId)
      .single();
    expect(row).toEqual({
      requester_id: teamId,
      requested_by: owner.id,
      organizer_user_id: teamId,
    });

    // A permit alone is not the business check.
    await addDocument(caseId, owner.id, "event_permit");
    const thin = await submitVerificationCaseCore(
      svc,
      teamId,
      { caseId },
      owner.id,
    );
    expect(thin.status).toBe(422);

    // A Manager cannot act on the team's request.
    const byManager = await submitVerificationCaseCore(
      svc,
      teamId,
      { caseId },
      manager.id,
    );
    expect(byManager.status).toBe(404);

    await addDocument(caseId, owner.id, "business_registration");
    await addDocument(caseId, owner.id, "director_listing");
    const sent = await submitVerificationCaseCore(
      svc,
      teamId,
      { caseId },
      owner.id,
    );
    expect(sent.status, sent.message).toBe(200);

    const notByManager = await withdrawVerificationCaseCore(
      svc,
      teamId,
      { caseId },
      manager.id,
    );
    expect(notByManager.status).toBe(404);

    // A paused team is not approved.
    const ctx = {
      userId: staff.id,
      email: staff.email,
      roles: ["operations"],
      permissions: ["teams.view", "teams.manage"],
      reauthenticatedAt: Date.now(),
    } as never;
    const paused = await setTeamStatusAdminCore(svc, ctx, {
      teamId,
      to: "frozen",
      why: "staff",
      reason: "Ticket 303: checking the papers",
    });
    expect(paused.status).toBe(200);
    const refused = await approve(caseId);
    expect(refused.error?.message).toContain("verification_subject_ineligible");
    await setTeamStatusAdminCore(svc, ctx, {
      teamId,
      to: "active",
      reason: "Ticket 303: papers fine",
    });

    const ok = await approve(caseId);
    expect(ok.error).toBeNull();
    const { data: team } = await service
      .from("user_info")
      .select("organizer_verified")
      .eq("id", teamId)
      .single();
    expect(team?.organizer_verified).toBe(true);

    // The Owner hears about it (the notice to the team is copied to them).
    const { data: notices } = await service
      .from("notification")
      .select("type")
      .eq("user_id", owner.id)
      .eq("type", "verification_submitted");
    expect((notices ?? []).length).toBeGreaterThan(0);
  });

  it("sends a renamed Verified team back to review and tells its Owners (X42)", async () => {
    const owner = await person();
    const finance = await person();
    const teamId = await teamWith(owner, finance, "finance");
    const started = await startVerificationCaseCore(
      svc,
      teamId,
      {
        subjectType: "organizer",
        subjectId: teamId,
        organizerType: "business",
      },
      owner.id,
    );
    const caseId = started.data?.caseId as string;
    await addDocument(caseId, owner.id, "business_registration");
    await addDocument(caseId, owner.id, "authorisation_letter");
    expect(
      (await submitVerificationCaseCore(svc, teamId, { caseId }, owner.id))
        .status,
    ).toBe(200);
    expect((await approve(caseId)).error).toBeNull();

    const renamed = await renameTeamCore(svc, owner.id, {
      teamId,
      name: "Osu Lounge Holdings",
    });
    expect(renamed.status).toBe(200);
    expect(renamed.message).toBeTruthy();

    const [{ data: team }, { data: kase }, { data: events }] =
      await Promise.all([
        service
          .from("user_info")
          .select(
            "full_name, organizer_verified, organizer_verification_case_id",
          )
          .eq("id", teamId)
          .single(),
        service
          .from("verification_case")
          .select("status")
          .eq("id", caseId)
          .single(),
        service
          .from("verification_event")
          .select("event_type, meta")
          .eq("case_id", caseId),
      ]);
    expect(team).toEqual({
      full_name: "Osu Lounge Holdings",
      organizer_verified: false,
      organizer_verification_case_id: null,
    });
    expect(kase?.status).toBe("pending_review");
    const types = (events ?? []).map((e) => e.event_type);
    expect(types).toContain("returned_to_review");
    expect(types).toContain("subject_changed");

    // The Owner's view says why.
    const view = await getSubjectVerificationCore(
      svc,
      teamId,
      { subjectType: "organizer", subjectId: teamId },
      owner.id,
    );
    expect(view.data?.openCase?.returnedToReview).toBe(true);

    // Owners are told; Finance is not (verification is the Owners').
    const told = async (userId: string) =>
      (
        await service
          .from("notification")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "verification_back_in_review")
      ).data?.length ?? 0;
    expect(await told(owner.id)).toBe(1);
    expect(await told(finance.id)).toBe(0);

    // A reviewer approves the new name: the badge is back.
    expect((await approve(caseId)).error).toBeNull();
    const { data: after } = await service
      .from("user_info")
      .select("organizer_verified")
      .eq("id", teamId)
      .single();
    expect(after?.organizer_verified).toBe(true);
  });

  it("shows ID checked on a team when one of its Owners passed", async () => {
    const owner = await person();
    const finance = await person();
    const teamId = await teamWith(owner, finance, "finance");
    const checked = async () =>
      (await service.rpc("account_id_checked", { p_account: teamId })).data;

    expect(await checked()).toBe(false);
    // Finance passing is not an Owner passing.
    await service
      .from("user_info")
      .update({
        identity_verified: true,
        identity_valid_until: new Date(Date.now() + 86_400_000).toISOString(),
      } as never)
      .eq("id", finance.id);
    expect(await checked()).toBe(false);
    await service
      .from("user_info")
      .update({
        identity_verified: true,
        identity_valid_until: new Date(Date.now() + 86_400_000).toISOString(),
      } as never)
      .eq("id", owner.id);
    expect(await checked()).toBe(true);

    // The same answer as a column anyone can read, never which Owner.
    const anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    const { data: row, error } = await anon
      .from("user_info")
      .select("id_checked")
      .eq("id", teamId)
      .single();
    expect(error).toBeNull();
    expect(row?.id_checked).toBe(true);

    // An expired check does not count.
    await service
      .from("user_info")
      .update({
        identity_valid_until: new Date(Date.now() - 1000).toISOString(),
      } as never)
      .eq("id", owner.id);
    expect(await checked()).toBe(false);
  });
});
