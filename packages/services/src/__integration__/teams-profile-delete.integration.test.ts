import { ADMIN_PERMISSION_KEYS } from "@abonten/core/adminPermissions";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// A team's profile and deleting a team (migration 20261125100000,
// docs/architecture/team-accounts.md §4n–§4p): Owners edit the username,
// bio, website, social links and photo, others cannot; a taken username is
// a 409. Deleting needs every Owner (fresh sign-ins, the typed name), is
// refused while something is owed or running, ends when an Owner stops it
// or the Owners change, is held back for 7 days after an Owner was removed
// or demoted by another, and when it runs: members and invitations go, the
// team is closed, its account scrubbed and soft-deleted, the money record
// stays, every member is told, and "Managing as" the team falls back to the
// person. Staff may delete a team without its Owners.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteTeamAdminCore } from "../admin/teams/teamsAdminCore";
import { resolveActingAccount } from "../teams/actingAccount";
import {
  answerTeamInviteCore,
  createTeamCore,
  getTeamCore,
  inviteTeamMemberCore,
  leaveTeamCore,
  removeTeamMemberCore,
  setTeamMemberRoleCore,
} from "../teams/teamCore";
import {
  approveTeamDeletionCore,
  cancelTeamDeletionCore,
  requestTeamDeletionCore,
} from "../teams/teamDeletionCore";
import {
  saveTeamPhotoCore,
  teamPhotoUploadSignatureCore,
  updateTeamProfileCore,
} from "../teams/teamProfileCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const noText = { canTextNumber: async () => false };
const fresh = { signedInAt: Date.now() };
const now = () => ({ signedInAt: Date.now() });
type Role = "owner" | "finance" | "manager" | "content" | "door" | "front_desk";

describe("a team's profile and deleting a team", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  const teamIds: string[] = [];
  const eventIds: string[] = [];

  const tag = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const handleOf = (u: TestUser) => `tp_${u.id.slice(0, 8)}`;

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: handleOf(u), full_name: "Team Person" })
      .eq("id", u.id);
    return u;
  }

  async function makeTeam(owner: TestUser, name = "Echo Nights") {
    const res = await createTeamCore(svc, owner.id, {
      adult: true,
      name,
      username: `tpt_${tag()}`,
    });
    if (res.status !== 200) throw new Error(res.message);
    teamIds.push(res.data.id);
    return res.data.id;
  }

  async function join(
    teamId: string,
    owner: TestUser,
    who: TestUser,
    role: Role,
  ) {
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      { teamId, role, target: { kind: "username", username: handleOf(who) } },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    const res = await answerTeamInviteCore(svc, who.id, {
      adult: true,
      inviteId: sent.data.id,
      action: "accept",
    });
    if (res.status !== 200) throw new Error(res.message);
  }

  async function pendingRequest(teamId: string) {
    const { data } = await service
      .from("team_deletion_request")
      .select("id, status, end_reason")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  }

  const teamStatus = async (teamId: string) =>
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
  });

  afterAll(async () => {
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    const accounts = [...teamIds, ...users.map((u) => u.id)];
    await service.from("admin_audit_log").delete().in("actor_id", accounts);
    await service
      .from("organizer_ledger_entry")
      .delete()
      .in("organizer_id", accounts);
    await service.from("payout").delete().in("organizer_id", accounts);
    await service.from("payout_account").delete().in("organizer_id", accounts);
    await service.from("follow").delete().in("follower_id", accounts);
    for (const id of eventIds) {
      await service.from("ticket_checkout").delete().eq("event_id", id);
      await service.from("conversation").delete().eq("event_id", id);
      await deleteTestEvent(service, id).catch(() => undefined);
    }
    for (const id of teamIds) {
      await service.from("notification").delete().eq("user_id", id);
      await service.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  // --- The profile -----------------------------------------------------------

  it("lets an Owner change the username, bio, website, social links and photo", async () => {
    const owner = await person();
    const teamId = await makeTeam(owner);
    const handle = `tpn_${tag()}`;
    const res = await updateTeamProfileCore(svc, owner.id, {
      teamId,
      username: `@${handle}`,
      bio: "Live music every Friday in Osu.",
      website: "https://echonights.com",
      socialLinks: { instagram: "@echonights", x: "" },
    });
    expect(res.status, "message" in res ? res.message : "").toBe(200);
    const { data: row } = await service
      .from("user_info")
      .select("username, bio, website, social_links, username_is_generated")
      .eq("id", teamId)
      .single();
    expect(String(row?.username)).toBe(handle);
    expect(row?.username_is_generated).toBe(false);
    expect(row?.bio).toBe("Live music every Friday in Osu.");
    expect(row?.website).toBe("https://echonights.com");
    expect(row?.social_links).toEqual({
      instagram: "https://www.instagram.com/echonights",
    });

    // The photo: a signature for the team's own folder, then the save.
    process.env.CLOUDINARY_API_SECRET ??= "test-secret";
    const sig = await teamPhotoUploadSignatureCore(svc, owner.id, teamId);
    expect(sig.status).toBe(200);
    expect(sig.status === 200 && sig.data?.folder).toBe(
      `user_profiles/${teamId}`,
    );
    const wrongFolder = await saveTeamPhotoCore(svc, owner.id, {
      teamId,
      publicId: `user_profiles/${owner.id}/mine`,
      version: 1,
    });
    expect(wrongFolder.status).toBe(403);
    const photo = await saveTeamPhotoCore(svc, owner.id, {
      teamId,
      publicId: `user_profiles/${teamId}/team_photo`,
      version: 1732500000,
      transformation: "400, 400",
    });
    expect(photo.status).toBe(200);
    const { data: avatar } = await service
      .from("user_info")
      .select("avatar_public_id, avatar_version")
      .eq("id", teamId)
      .single();
    expect(avatar).toEqual({
      avatar_public_id: `user_profiles/${teamId}/team_photo`,
      avatar_version: "1732500000",
    });
    const { count: history } = await service
      .from("user_image_history")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", teamId);
    expect(history).toBe(1);

    // Owners see it on the team page; the activity says what changed.
    const detail = await getTeamCore(svc, owner.id, teamId);
    expect(detail.status).toBe(200);
    if (detail.status !== 200) return;
    expect(detail.data.profile?.bio).toBe("Live music every Friday in Osu.");
    const actions = (detail.data.activity ?? []).map((a) => a.action);
    expect(actions).toContain("team.username_changed");
    expect(actions).toContain("team.profile_updated");
    const changed = detail.data.activity?.find(
      (a) => a.action === "team.username_changed",
    );
    expect(changed?.details).toMatchObject({ to: handle });
  });

  it("refuses everyone but an Owner, and says when a username is taken", async () => {
    const owner = await person();
    const manager = await person();
    const outsider = await person();
    const teamId = await makeTeam(owner);
    await join(teamId, owner, manager, "manager");

    const notOwner = await updateTeamProfileCore(svc, manager.id, {
      teamId,
      bio: "Hijacked",
    });
    expect(notOwner.status).toBe(403);
    const notMember = await updateTeamProfileCore(svc, outsider.id, {
      teamId,
      bio: "Hijacked",
    });
    expect(notMember.status).toBe(404);
    const noSignature = await teamPhotoUploadSignatureCore(
      svc,
      manager.id,
      teamId,
    );
    expect(noSignature.status).toBe(403);

    const taken = await updateTeamProfileCore(svc, owner.id, {
      teamId,
      username: handleOf(outsider).toUpperCase(),
    });
    expect(taken.status).toBe(409);
    const reserved = await updateTeamProfileCore(svc, owner.id, {
      teamId,
      username: "deleted_abcdef",
    });
    expect(reserved.status).toBe(400);
    // The database refuses it too, whatever the caller.
    const { error } = await svc.rpc("team_update_profile", {
      p_team: teamId,
      p_by: owner.id,
      p_patch: { username: "deleted_abcdef" },
    });
    expect(error?.message).toMatch(/team:username_taken/);
    const { error: byManager } = await svc.rpc("team_update_profile", {
      p_team: teamId,
      p_by: manager.id,
      p_patch: { bio: "x" },
    });
    expect(byManager?.message).toMatch(/team:not_allowed/);
  });

  // --- Deleting ---------------------------------------------------------------

  it("deletes a one-Owner team after the typed name and a fresh sign-in, and keeps the record", async () => {
    const owner = await person();
    const manager = await person();
    const fan = await person();
    const invited = await person();
    const teamId = await makeTeam(owner, "Kɔfi Bar");
    await join(teamId, owner, manager, "manager");
    const pending = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role: "content",
        target: { kind: "username", username: handleOf(invited) },
      },
      noText,
    );
    expect(pending.status).toBe(200);
    await service.from("follow").insert({
      follower_id: fan.id,
      target_kind: "organizer",
      target_id: teamId,
    });
    // A payout the team was paid: nothing owed, and the record must stay.
    const { data: payAccount } = await service
      .from("payout_account")
      .insert({
        organizer_id: teamId,
        account_type: "mobile_money",
        account_holder_name: "Kofi Bar",
        account_number: "0240000008",
        country_code: "GH",
        currency: "GHS",
      } as never)
      .select("id")
      .single();
    const { data: paid } = await service
      .from("payout")
      .insert({
        organizer_id: teamId,
        payout_account_id: (payAccount as { id: string }).id,
        amount: 40,
        currency: "GHS",
        reference: `PO-${tag()}`,
        status: "completed",
      } as never)
      .select("id")
      .single();
    await service.from("organizer_ledger_entry").insert({
      organizer_id: teamId,
      entry_type: "payout_hold",
      amount: -40,
      currency: "GHS",
      payout_id: (paid as { id: string }).id,
    } as never);

    const wrongName = await requestTeamDeletionCore(
      svc,
      owner.id,
      { teamId, confirmName: "Kofi Bar" },
      fresh,
    );
    expect(wrongName.status).toBe(400);
    const stale = await requestTeamDeletionCore(
      svc,
      owner.id,
      { teamId, confirmName: "kɔfi  bar" },
      { signedInAt: Date.now() - 60 * 60_000 },
    );
    expect(stale.status).toBe(403);
    const byManager = await requestTeamDeletionCore(
      svc,
      manager.id,
      { teamId, confirmName: "Kɔfi Bar" },
      fresh,
    );
    expect(byManager.status).toBe(403);

    const res = await requestTeamDeletionCore(
      svc,
      owner.id,
      { teamId, confirmName: " kɔfi bar " },
      now(),
    );
    expect(res.status, "message" in res ? res.message : "").toBe(200);
    expect(res.status === 200 && res.data.state).toBe("deleted");

    expect(await teamStatus(teamId)).toEqual({
      status: "closed",
      status_reason: "closed_by_owner",
    });
    const { data: members } = await service
      .from("team_member")
      .select("status")
      .eq("team_id", teamId);
    expect(members?.every((m) => m.status === "removed")).toBe(true);
    const { data: invite } = await service
      .from("team_invite")
      .select("status")
      .eq("id", pending.status === 200 ? pending.data.id : "")
      .single();
    expect(invite?.status).toBe("cancelled");
    const { data: profile } = await service
      .from("user_info")
      .select("full_name, username, status_id")
      .eq("id", teamId)
      .single();
    expect(profile?.full_name).toBe("Deleted user");
    expect(String(profile?.username)).toMatch(/^deleted_/);
    expect(profile?.status_id).toBe(4);
    // Nobody follows an account that is gone.
    const { count: follows } = await service
      .from("follow")
      .select("id", { count: "exact", head: true })
      .eq("target_id", teamId);
    expect(follows).toBe(0);
    // The financial record stays; the auth user is soft-deleted, not gone.
    const { count: ledger } = await service
      .from("organizer_ledger_entry")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", teamId);
    expect(ledger).toBe(1);
    const { count: payouts } = await service
      .from("payout")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", teamId);
    expect(payouts).toBe(1);
    const { data: authUser } = await service.auth.admin.getUserById(teamId);
    expect(authUser.user).not.toBeNull();
    // Every member is told, in a notice of their own.
    for (const who of [owner, manager]) {
      const { data: notes } = await service
        .from("notification")
        .select("type, data")
        .eq("user_id", who.id)
        .eq("type", "team_deleted");
      expect(notes?.length).toBe(1);
      expect(
        (notes?.[0]?.data as { notice?: { params?: { team?: string } } })
          ?.notice?.params?.team,
      ).toBe("Kɔfi Bar");
    }
    // The activity says who.
    const { data: log } = await service
      .from("team_activity")
      .select("actor_user_id, details")
      .eq("team_id", teamId)
      .eq("action", "team.deleted")
      .single();
    expect(log?.actor_user_id).toBe(owner.id);
    expect(log?.details).toMatchObject({ name: "Kɔfi Bar", by: "owners" });

    // "Managing as" the deleted team is the person's own account again.
    const acting = await resolveActingAccount(
      svc,
      manager.id,
      teamId,
      "events.manage",
    );
    expect(acting.ok && acting.actor.accountId).toBe(manager.id);
    expect(acting.ok && acting.actor.role).toBeNull();
  });

  it("refuses while the team owes attendees, a payout is moving, money is owed or a payment is going through", async () => {
    const owner = await person();
    const buyer = await person();
    const teamId = await makeTeam(owner, "Blocked Crew");
    const ask = () =>
      requestTeamDeletionCore(
        svc,
        owner.id,
        { teamId, confirmName: "Blocked Crew" },
        now(),
      );

    // An upcoming event with a ticket someone holds.
    const { eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      teamId,
      { quantity: 10, price: 0 },
    );
    eventIds.push(eventId);
    const { data: ticket } = await service
      .from("ticket")
      .insert({
        user_id: buyer.id,
        ticket_type_id: ticketTypeId,
        status: "active",
        qr_public_id: "test/qr",
        qr_version: "1",
        ticket_code: `T-${tag()}`,
        expires_at: new Date(Date.now() + 90_000_000).toISOString(),
      } as never)
      .select("id")
      .single();
    let res = await ask();
    expect(res.status).toBe(409);
    expect("message" in res && res.message).toMatch(/upcoming events/i);
    await service
      .from("ticket")
      .update({ status: "cancelled" } as never)
      .eq("id", (ticket as { id: string }).id);

    // Someone is paying for a ticket right now.
    const { data: checkout } = await service
      .from("ticket_checkout")
      .insert({
        user_id: buyer.id,
        event_id: eventId,
        ticket_type_id: ticketTypeId,
        quantity: 1,
        unit_price: 0,
        total_price: 0,
        status: "pending",
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      } as never)
      .select("id")
      .single();
    res = await ask();
    expect(res.status).toBe(409);
    expect("message" in res && res.message).toMatch(/payment/i);
    await service
      .from("ticket_checkout")
      .update({ status: "expired" } as never)
      .eq("id", (checkout as { id: string }).id);

    // A payout on its way.
    const { data: account } = await service
      .from("payout_account")
      .insert({
        organizer_id: teamId,
        account_type: "mobile_money",
        account_holder_name: "Blocked Crew",
        account_number: "0240000009",
        country_code: "GH",
        currency: "GHS",
      } as never)
      .select("id")
      .single();
    await service.from("payout").insert({
      organizer_id: teamId,
      payout_account_id: (account as { id: string }).id,
      amount: 20,
      currency: "GHS",
      reference: `PO-${tag()}`,
      status: "processing",
    } as never);
    res = await ask();
    expect(res.status).toBe(409);
    expect("message" in res && res.message).toMatch(/payout/i);
    await service
      .from("payout")
      .update({ status: "completed" } as never)
      .eq("organizer_id", teamId);

    // Money Abonten still owes the team (a payout that failed gave its
    // hold back).
    const { data: failed } = await service
      .from("payout")
      .insert({
        organizer_id: teamId,
        payout_account_id: (account as { id: string }).id,
        amount: 25,
        currency: "GHS",
        reference: `PO-${tag()}`,
        status: "failed",
      } as never)
      .select("id")
      .single();
    await service.from("organizer_ledger_entry").insert({
      organizer_id: teamId,
      entry_type: "payout_release",
      amount: 25,
      currency: "GHS",
      payout_id: (failed as { id: string }).id,
    } as never);
    res = await ask();
    expect(res.status).toBe(409);
    expect("message" in res && res.message).toMatch(/earnings/i);
    const { data: blockers } = await svc.rpc("team_deletion_blockers", {
      p_team: teamId,
    });
    expect(blockers).toMatchObject({
      upcoming_events_with_attendees: 0,
      payments_in_progress: 0,
      payouts_in_flight: 0,
    });
    expect(Number((blockers as { balance_owed: number }).balance_owed)).toBe(
      25,
    );
    // Nothing was deleted along the way.
    expect((await teamStatus(teamId))?.status).toBe("active");
  });

  it("waits for every Owner: one asks, the other approves, then it is deleted", async () => {
    const a = await person();
    const b = await person();
    const teamId = await makeTeam(a, "Two Owners");
    await join(teamId, a, b, "owner");

    const asked = await requestTeamDeletionCore(
      svc,
      a.id,
      { teamId, confirmName: "Two Owners" },
      now(),
    );
    expect(asked.status === 200 && asked.data).toMatchObject({
      state: "requested",
      owners: 2,
      approvals: 1,
    });
    expect((await teamStatus(teamId))?.status).toBe("active");
    // B is told and sees "waiting for 1 of 2" on the team page.
    const { count: told } = await service
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("user_id", b.id)
      .eq("type", "team_delete_requested");
    expect(told).toBe(1);
    const detail = await getTeamCore(svc, b.id, teamId);
    expect(detail.status === 200 && detail.data.deletion).toMatchObject({
      owners: 2,
      approvals: 1,
      approvedByMe: false,
    });
    const requestId =
      detail.status === 200 ? (detail.data.deletion?.id ?? "") : "";

    // A second request while one is open is refused.
    const again = await requestTeamDeletionCore(
      svc,
      a.id,
      { teamId, confirmName: "Two Owners" },
      now(),
    );
    expect(again.status).toBe(409);
    // B's approval needs a fresh sign-in too.
    const stale = await approveTeamDeletionCore(
      svc,
      b.id,
      { teamId, requestId },
      { signedInAt: null },
    );
    expect(stale.status).toBe(403);

    const approved = await approveTeamDeletionCore(
      svc,
      b.id,
      { teamId, requestId },
      now(),
    );
    expect(approved.status, "message" in approved ? approved.message : "").toBe(
      200,
    );
    expect(approved.status === 200 && approved.data.state).toBe("deleted");
    expect((await teamStatus(teamId))?.status).toBe("closed");
    expect((await pendingRequest(teamId))?.status).toBe("completed");
  });

  it("does not delete when an Owner stops the request", async () => {
    const a = await person();
    const b = await person();
    const teamId = await makeTeam(a, "Stopped Crew");
    await join(teamId, a, b, "owner");
    await requestTeamDeletionCore(
      svc,
      a.id,
      { teamId, confirmName: "Stopped Crew" },
      now(),
    );
    const request = await pendingRequest(teamId);
    const stop = await cancelTeamDeletionCore(svc, b.id, {
      teamId,
      requestId: request?.id ?? "",
    });
    expect(stop.status).toBe(200);
    expect(await pendingRequest(teamId)).toMatchObject({
      status: "cancelled",
      end_reason: "cancelled",
    });
    const late = await approveTeamDeletionCore(
      svc,
      b.id,
      { teamId, requestId: request?.id ?? "" },
      now(),
    );
    expect(late.status).toBe(409);
    expect((await teamStatus(teamId))?.status).toBe("active");
    // A is told who stopped it.
    const { count: told } = await service
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("user_id", a.id)
      .eq("type", "team_delete_cancelled");
    expect(told).toBe(1);
  });

  it("ends a request when the Owners change", async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    const teamId = await makeTeam(a, "Changing Crew");
    await join(teamId, a, b, "owner");
    await join(teamId, a, c, "owner");
    await requestTeamDeletionCore(
      svc,
      a.id,
      { teamId, confirmName: "Changing Crew" },
      now(),
    );
    const request = await pendingRequest(teamId);
    expect(request?.status).toBe("pending");
    // C leaves (their own choice): the Owners who agreed are not the Owners.
    expect((await leaveTeamCore(svc, c.id, teamId)).status).toBe(200);
    expect(await pendingRequest(teamId)).toMatchObject({
      status: "cancelled",
      end_reason: "owners_changed",
    });
    const late = await approveTeamDeletionCore(
      svc,
      b.id,
      { teamId, requestId: request?.id ?? "" },
      now(),
    );
    expect(late.status).toBe(409);
    expect((await teamStatus(teamId))?.status).toBe("active");
  });

  it("holds deletion back for 7 days after an Owner is removed or demoted by another, and tells them who", async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    const teamId = await makeTeam(a, "Guarded Crew");
    await join(teamId, a, b, "owner");
    await join(teamId, a, c, "owner");

    expect(
      (await removeTeamMemberCore(svc, a.id, { teamId, userId: b.id })).status,
    ).toBe(200);
    expect(
      (
        await setTeamMemberRoleCore(svc, a.id, {
          teamId,
          userId: c.id,
          role: "manager",
        })
      ).status,
    ).toBe(200);
    const removedNotice = await service
      .from("notification")
      .select("data")
      .eq("user_id", b.id)
      .eq("type", "team_owner_removed")
      .single();
    expect(
      (removedNotice.data?.data as { notice?: { params?: { actor?: string } } })
        ?.notice?.params?.actor,
    ).toBe("Team Person");
    const { count: demotedNotice } = await service
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("user_id", c.id)
      .eq("type", "team_owner_demoted");
    expect(demotedNotice).toBe(1);

    // A is now the only Owner, but cannot delete alone for 7 days.
    const res = await requestTeamDeletionCore(
      svc,
      a.id,
      { teamId, confirmName: "Guarded Crew" },
      now(),
    );
    expect(res.status).toBe(409);
    expect("message" in res && res.message).toMatch(/7 days/);
    expect((await teamStatus(teamId))?.status).toBe("active");

    // The sweep does not end anything here (there was no request), and the
    // rule is the database's: the blockers say why.
    const { data: blockers } = await svc.rpc("team_deletion_blockers", {
      p_team: teamId,
    });
    expect(
      Number(
        (blockers as { owners_changed_recently: number })
          .owners_changed_recently,
      ),
    ).toBe(2);
  });

  it("lets staff delete a team without its Owners, audited, and tells the members", async () => {
    const staff = await person();
    const a = await person();
    const b = await person();
    const teamId = await makeTeam(a, "Abuse Crew");
    await join(teamId, a, b, "owner");
    // A removed B: the Owners' seven-day rule does not bind staff.
    await removeTeamMemberCore(svc, a.id, { teamId, userId: b.id });
    const ctx = {
      userId: staff.id,
      email: staff.email,
      roles: ["operations"],
      permissions: [...ADMIN_PERMISSION_KEYS],
      reauthenticatedAt: Date.now(),
    } as unknown as AdminContext;

    const viewOnly = await deleteTeamAdminCore(
      svc,
      { ...ctx, permissions: ["teams.view"] } as AdminContext,
      { teamId, reason: "Fraud report confirmed" },
    );
    expect(viewOnly.status).toBe(403);

    const res = await deleteTeamAdminCore(svc, ctx, {
      teamId,
      reason: "Fraud report confirmed",
    });
    expect(res.status, res.message).toBe(200);
    expect(await teamStatus(teamId)).toEqual({
      status: "closed",
      status_reason: "staff",
    });
    const { data: audit } = await service
      .from("admin_audit_log")
      .select("action, reason")
      .eq("actor_id", staff.id)
      .eq("target_id", teamId);
    expect(audit?.[0]).toMatchObject({
      action: "teams.delete",
      reason: "Fraud report confirmed",
    });
    const { count: told } = await service
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("user_id", a.id)
      .eq("type", "team_deleted_by_staff");
    expect(told).toBe(1);
    // Deleting it twice is refused.
    const twice = await deleteTeamAdminCore(svc, ctx, {
      teamId,
      reason: "Fraud report confirmed",
    });
    expect(twice.status).toBe(404);
  });

  it("keeps the new tables and functions service-role only", async () => {
    const owner = await person();
    const teamId = await makeTeam(owner, "Locked Crew");
    const { data, error } = await owner.client
      .from("team_deletion_request")
      .select("id")
      .eq("team_id", teamId);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    for (const fn of [
      "team_update_profile",
      "team_delete_request",
      "team_delete_finish",
      "admin_team_delete",
    ] as const) {
      const { error: callError } = await owner.client.rpc(
        fn as never,
        {
          p_team: teamId,
          p_by: owner.id,
          p_patch: {},
          p_days: 7,
          p_request: teamId,
          p_staff: owner.id,
        } as never,
      );
      expect(callError, fn).not.toBeNull();
    }
  });
});
