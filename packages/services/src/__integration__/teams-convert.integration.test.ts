import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// "Make this a team" (docs/architecture/team-accounts.md §4f, X8): the
// person's events, places (Verified kept), followers, alert subscribers,
// the conversations about their listings, organizer money, payout accounts
// and organizer badge move to a new team that takes their handle, name and
// photo; the person is its Owner with a new, generated handle; nothing moves
// while a payout is being processed or a verification request is open. An
// organizer badge moved under another name goes back to review (X42).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  convertAccountToTeamCore,
  getTeamsOverviewCore,
} from "../teams/teamCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("making an organizer account a team", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  const teamIds: string[] = [];
  const eventIds: string[] = [];
  const placeIds: string[] = [];

  async function person(handle: string): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    const { error } = await service
      .from("user_info")
      .update({
        username: handle,
        full_name: "Ama Mensah",
        bio: "Rooftop nights in Osu.",
        avatar_public_id: `user_profiles/${u.id}/avatar`,
        avatar_version: "7",
        username_is_generated: false,
      })
      .eq("id", u.id);
    if (error) throw new Error(error.message);
    return u;
  }

  async function placeFor(ownerId: string, verified: boolean) {
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: ownerId,
        name: "Ama's Rooftop",
        slug: `amas-rooftop-${crypto.randomUUID()}`,
        description: "Converted place.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra", country: "Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
        verified,
        verified_at: verified ? new Date().toISOString() : null,
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message);
    const id = (data as { id: string }).id;
    placeIds.push(id);
    return id;
  }

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
    await service
      .from("organizer_ledger_entry")
      .delete()
      .in("organizer_id", accounts);
    await service.from("payout").delete().in("organizer_id", accounts);
    await service.from("payout_account").delete().in("organizer_id", accounts);
    await service
      .from("notification_subscription")
      .delete()
      .in("user_id", accounts);
    await service.from("follow").delete().in("follower_id", accounts);
    for (const id of eventIds) {
      await service.from("conversation").delete().eq("event_id", id);
      await deleteTestEvent(service, id).catch(() => undefined);
    }
    if (placeIds.length)
      await service.from("place").delete().in("id", placeIds);
    for (const id of teamIds) {
      await service.from("notification").delete().eq("user_id", id);
      await service.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("moves the handle, listings, followers, conversations, money and badges to the new team", async () => {
    const handle = `ama_${crypto.randomUUID().slice(0, 6)}`;
    const ama = await person(handle);
    const fan = await person(`fan_${crypto.randomUUID().slice(0, 6)}`);
    const { eventId } = await createTestEventWithTicketType(service, ama.id, {
      quantity: 10,
      price: 0,
    });
    eventIds.push(eventId);
    const placeId = await placeFor(ama.id, true);
    await service
      .from("user_info")
      .update({
        organizer_verified: true,
        organizer_verified_at: new Date().toISOString(),
      })
      .eq("id", ama.id);
    // The badge came from an approved request. Before 20261116190000 any
    // organizer case made the conversion fail (the case moved to the team
    // while its requester stayed the person).
    const { data: badgeCase, error: caseError } = await service
      .from("verification_case")
      .insert({
        subject_type: "organizer",
        organizer_user_id: ama.id,
        requester_id: ama.id,
        status: "approved",
        organizer_type: "business",
        source: "owner",
        submitted_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();
    expect(caseError).toBeNull();
    const caseId = (badgeCase as { id: string }).id;
    await service
      .from("user_info")
      .update({ organizer_verification_case_id: caseId })
      .eq("id", ama.id);
    await service.from("follow").insert({
      follower_id: fan.id,
      target_kind: "organizer",
      target_id: ama.id,
    });
    await service.from("notification_subscription").insert({
      user_id: fan.id,
      kind: "organizer",
      target_id: ama.id,
      source: "profile",
    } as never);
    const { data: conv, error: convError } = await fan.client.rpc(
      "open_conversation",
      { p_type: "event", p_event_id: eventId },
    );
    expect(convError).toBeNull();
    const { data: account } = await service
      .from("payout_account")
      .insert({
        organizer_id: ama.id,
        account_type: "mobile_money",
        account_holder_name: "Ama Mensah",
        account_number: "0240000000",
        country_code: "GH",
        currency: "GHS",
      } as never)
      .select("id")
      .single();
    const { data: payout } = await service
      .from("payout")
      .insert({
        organizer_id: ama.id,
        payout_account_id: (account as { id: string }).id,
        amount: 50,
        currency: "GHS",
        reference: `PO-${crypto.randomUUID().slice(0, 8)}`,
        status: "completed",
      } as never)
      .select("id")
      .single();
    await service.from("organizer_ledger_entry").insert({
      organizer_id: ama.id,
      entry_type: "payout_hold",
      amount: -50,
      currency: "GHS",
      payout_id: (payout as { id: string }).id,
    } as never);

    const overview = await getTeamsOverviewCore(svc, ama.id);
    expect(overview.status === 200 && overview.data.canConvert).toBe(true);

    const res = await convertAccountToTeamCore(svc, ama.id, {
      name: "Ama Nights",
    });
    expect(res.status, "message" in res ? res.message : "").toBe(200);
    if (res.status !== 200) return;
    const teamId = res.data.team.id;
    teamIds.push(teamId);
    expect(res.data).toMatchObject({ events: 1, places: 1, followers: 1 });
    // X42: the badge names the business and the team took another name, so
    // it is back in review; the case moved whole to the team.
    expect(res.data.badgeBackInReview).toBe(true);
    const { data: moved } = await service
      .from("verification_case")
      .select("organizer_user_id, requester_id, requested_by, status")
      .eq("id", caseId)
      .single();
    expect(moved).toEqual({
      organizer_user_id: teamId,
      requester_id: teamId,
      requested_by: ama.id,
      status: "pending_review",
    });

    const { data: team } = await service
      .from("user_info")
      .select(
        "username, full_name, bio, avatar_public_id, account_kind, organizer_verified",
      )
      .eq("id", teamId)
      .single();
    expect(team).toEqual({
      username: handle,
      full_name: "Ama Nights",
      bio: "Rooftop nights in Osu.",
      avatar_public_id: `user_profiles/${ama.id}/avatar`,
      account_kind: "team",
      organizer_verified: false,
    });
    const { data: me } = await service
      .from("user_info")
      .select("username, username_is_generated, organizer_verified")
      .eq("id", ama.id)
      .single();
    expect(me?.username).not.toBe(handle);
    expect(me?.username).toBe(res.data.personUsername);
    expect(me?.username_is_generated).toBe(true);
    expect(me?.organizer_verified).toBe(false);

    const { data: member } = await service
      .from("team_member")
      .select("role, status")
      .eq("team_id", teamId)
      .eq("user_id", ama.id)
      .single();
    expect(member).toEqual({ role: "owner", status: "active" });

    const { data: event } = await service
      .from("event")
      .select("organizer_id")
      .eq("id", eventId)
      .single();
    expect(event?.organizer_id).toBe(teamId);
    const { data: place } = await service
      .from("place")
      .select("owner_id, verified")
      .eq("id", placeId)
      .single();
    expect(place).toEqual({ owner_id: teamId, verified: true });

    const { data: follows } = await service
      .from("follow")
      .select("target_id")
      .eq("follower_id", fan.id)
      .eq("target_kind", "organizer");
    expect((follows ?? []).map((f) => f.target_id)).toEqual([teamId]);
    const { data: counts } = await service
      .from("follow_count")
      .select("target_id, follower_count")
      .eq("target_kind", "organizer")
      .in("target_id", [teamId, ama.id]);
    const countOf = (id: string) =>
      (counts ?? []).find((c) => c.target_id === id)?.follower_count ?? 0;
    expect(countOf(teamId)).toBe(1);
    expect(countOf(ama.id)).toBe(0);
    const { data: alert } = await service
      .from("notification_subscription")
      .select("target_id")
      .eq("user_id", fan.id)
      .eq("kind", "organizer")
      .single();
    expect(alert?.target_id).toBe(teamId);

    const { data: participants } = await service
      .from("conversation_participant")
      .select("user_id")
      .eq("conversation_id", conv as string);
    const ids = (participants ?? []).map((p) => p.user_id);
    expect(ids).toContain(teamId);
    expect(ids).not.toContain(ama.id);

    for (const table of [
      "organizer_ledger_entry",
      "payout",
      "payout_account",
    ] as const) {
      const { count: mine } = await service
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", ama.id);
      const { count: theirs } = await service
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", teamId);
      expect([table, mine, theirs]).toEqual([table, 0, 1]);
    }

    const { data: activity } = await service
      .from("team_activity")
      .select("action, actor_user_id")
      .eq("team_id", teamId)
      .eq("action", "team.converted")
      .single();
    expect(activity?.actor_user_id).toBe(ama.id);

    // Nothing left to move: the person is now just the team's Owner.
    const again = await convertAccountToTeamCore(svc, ama.id, {
      name: "Twice",
    });
    expect(again.status).toBe(409);
  });

  it("refuses while there is nothing to move, a payout is on its way, or a verification request is open", async () => {
    const teamsBefore = await service
      .from("team")
      .select("account_id", { count: "exact", head: true });

    const empty = await person(`empty_${crypto.randomUUID().slice(0, 6)}`);
    const nothing = await convertAccountToTeamCore(svc, empty.id, {
      name: "Nothing",
    });
    expect(nothing.status).toBe(409);

    const busy = await person(`busy_${crypto.randomUUID().slice(0, 6)}`);
    const busyPlace = await placeFor(busy.id, false);
    const { data: account } = await service
      .from("payout_account")
      .insert({
        organizer_id: busy.id,
        account_type: "mobile_money",
        account_holder_name: "Busy",
        account_number: "0240000001",
        country_code: "GH",
        currency: "GHS",
      } as never)
      .select("id")
      .single();
    await service.from("payout").insert({
      organizer_id: busy.id,
      payout_account_id: (account as { id: string }).id,
      amount: 20,
      currency: "GHS",
      reference: `PO-${crypto.randomUUID().slice(0, 8)}`,
      status: "processing",
    } as never);
    const paying = await convertAccountToTeamCore(svc, busy.id, {
      name: "Busy",
    });
    expect(paying.status).toBe(409);
    await service
      .from("payout")
      .update({ status: "completed" } as never)
      .eq("organizer_id", busy.id);

    await service.from("verification_case").insert({
      subject_type: "place",
      place_id: busyPlace,
      requester_id: busy.id,
      status: "draft",
    } as never);
    const reviewing = await convertAccountToTeamCore(svc, busy.id, {
      name: "Busy",
    });
    expect(reviewing.status).toBe(409);
    await service.from("verification_case").delete().eq("place_id", busyPlace);

    // Every refusal left nothing behind: no team, the place still theirs.
    const teamsAfter = await service
      .from("team")
      .select("account_id", { count: "exact", head: true });
    expect(teamsAfter.count).toBe(teamsBefore.count);
    const { data: place } = await service
      .from("place")
      .select("owner_id")
      .eq("id", busyPlace)
      .single();
    expect(place?.owner_id).toBe(busy.id);
  });

  it("is not offered while the programme is off", async () => {
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    try {
      const someone = await person(`off_${crypto.randomUUID().slice(0, 6)}`);
      await placeFor(someone.id, false);
      const res = await convertAccountToTeamCore(svc, someone.id, {
        name: "Off",
      });
      expect(res.status).toBe(403);
    } finally {
      await service
        .from("team_program_setting")
        .update({ enabled: true, audience: "all" })
        .eq("id", 1);
      resetTeamSettingsCache();
    }
  });
});
