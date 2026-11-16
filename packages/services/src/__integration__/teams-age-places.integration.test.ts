import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts (docs/architecture/team-accounts.md §4k): members are 18 or
// older (K7: they say so, and an ID check that finds someone under 18 keeps
// them out or takes them out); a team that runs several places limits Front
// desk and Door staff to some of them, and the access rules hold the limit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actorReachesPlace,
  resolveActingAccount,
} from "../teams/actingAccount";
import {
  answerTeamInviteCore,
  createTeamCore,
  inviteTeamMemberCore,
  setTeamMemberPlacesCore,
  setTeamMemberRoleCore,
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

const noText = { canTextNumber: async () => false };

describe("team members: 18 or older, and limited to places", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  const teamIds: string[] = [];
  const placeIds: string[] = [];
  const eventIds: string[] = [];

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `tg_${u.id.slice(0, 8)}`, full_name: "Age Person" })
      .eq("id", u.id);
    return u;
  }

  async function team(owner: TestUser) {
    const made = await createTeamCore(svc, owner.id, {
      name: "Chain Lounges",
      username: `tgt_${crypto.randomUUID().slice(0, 8)}`,
      adult: true,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamIds.push(made.data.id);
    return made.data.id;
  }

  async function invite(
    teamId: string,
    owner: TestUser,
    who: TestUser,
    role: string,
  ) {
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role: role as "door",
        target: { kind: "username", username: `tg_${who.id.slice(0, 8)}` },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    return sent.data.id;
  }

  async function join(
    teamId: string,
    owner: TestUser,
    who: TestUser,
    role: string,
  ) {
    const inviteId = await invite(teamId, owner, who, role);
    const res = await answerTeamInviteCore(svc, who.id, {
      inviteId,
      action: "accept",
      adult: true,
    });
    if (res.status !== 200) throw new Error(res.message);
  }

  async function underAge(userId: string) {
    const { error } = await service.from("identity_verification").insert({
      user_id: userId,
      provider: "test",
      status: "rejected",
      document_country: "GH",
      document_type: "GHANA_CARD",
      verification_method: "doc_selfie",
      provider_user_ref: `ref_${userId.replace(/-/g, "").slice(0, 20)}`,
      consent_at: new Date().toISOString(),
      consent_notice_version: "v1",
      consent_locale: "en",
      is_adult: false,
    } as never);
    if (error) throw new Error(error.message);
  }

  async function place(ownerId: string, name: string) {
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
        name,
        slug: `chain-${crypto.randomUUID()}`,
        description: "A branch.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra", country: "Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      } as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message);
    placeIds.push((data as { id: string }).id);
    return (data as { id: string }).id;
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
    for (const id of eventIds)
      await deleteTestEvent(service, id).catch(() => undefined);
    if (placeIds.length) {
      await service.from("place_booking").delete().in("place_id", placeIds);
      await service.from("place").delete().in("id", placeIds);
    }
    await service
      .from("identity_verification")
      .delete()
      .in(
        "user_id",
        users.map((u) => u.id),
      );
    for (const id of teamIds) {
      await service.from("notification").delete().eq("user_id", id);
      await service.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("asks everyone who runs a team to be 18 or older (K7)", async () => {
    const owner = await person();
    // Not saying so: refused.
    const silent = await createTeamCore(svc, owner.id, {
      name: "No Age",
      username: `tgn_${crypto.randomUUID().slice(0, 8)}`,
      adult: false,
    });
    expect(silent.status).toBe(400);

    const teamId = await team(owner);
    const { data: ownerRow } = await service
      .from("team_member")
      .select("adult_confirmed_at")
      .eq("team_id", teamId)
      .eq("user_id", owner.id)
      .single();
    expect(ownerRow?.adult_confirmed_at).toBeTruthy();

    // Accepting without saying so: refused.
    const newcomer = await person();
    const inviteId = await invite(teamId, owner, newcomer, "door");
    const quiet = await answerTeamInviteCore(svc, newcomer.id, {
      inviteId,
      action: "accept",
    });
    expect(quiet.status).toBe(400);

    // An ID check found them under 18: refused even when they say they are not.
    await underAge(newcomer.id);
    const minor = await answerTeamInviteCore(svc, newcomer.id, {
      inviteId,
      action: "accept",
      adult: true,
    });
    expect(minor.status).toBe(409);

    // A member whom an ID check later finds under 18 leaves the team.
    const member = await person();
    await join(teamId, owner, member, "content");
    await underAge(member.id);
    const { data: gone } = await service
      .from("team_member")
      .select("status")
      .eq("team_id", teamId)
      .eq("user_id", member.id)
      .single();
    expect(gone?.status).toBe("removed");
    const { data: logged } = await service
      .from("team_activity")
      .select("action, details")
      .eq("team_id", teamId)
      .eq("action", "member.account_closed")
      .eq("subject_id", member.id)
      .single();
    expect((logged?.details as { reason?: string })?.reason).toBe("under_age");
  });

  it("limits Front desk and Door staff to some places, and the database holds it", async () => {
    const owner = await person();
    const desk = await person();
    const door = await person();
    const manager = await person();
    const teamId = await team(owner);
    const osu = await place(teamId, "Osu branch");
    const legon = await place(teamId, "East Legon branch");
    await join(teamId, owner, desk, "front_desk");
    await join(teamId, owner, door, "door");
    await join(teamId, owner, manager, "manager");

    // Only roles that take bookings or scan can be limited, and only to the
    // team's places.
    expect(
      (
        await setTeamMemberPlacesCore(svc, owner.id, {
          teamId,
          userId: manager.id,
          placeIds: [osu],
        })
      ).status,
    ).toBe(409);
    const elsewhere = await place(owner.id, "Not the team's");
    expect(
      (
        await setTeamMemberPlacesCore(svc, owner.id, {
          teamId,
          userId: desk.id,
          placeIds: [elsewhere],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await setTeamMemberPlacesCore(svc, desk.id, {
          teamId,
          userId: desk.id,
          placeIds: [osu],
        })
      ).status,
    ).toBe(403);

    const set = await setTeamMemberPlacesCore(svc, owner.id, {
      teamId,
      userId: desk.id,
      placeIds: [osu],
    });
    expect(set.status, set.message).toBe(200);
    const acting = await resolveActingAccount(
      svc,
      desk.id,
      teamId,
      "bookings.manage",
    );
    expect(acting.ok && acting.actor.placeIds).toEqual([osu]);
    if (acting.ok) {
      expect(actorReachesPlace(acting.actor, osu)).toBe(true);
      expect(actorReachesPlace(acting.actor, legon)).toBe(false);
    }

    // The access rules: bookings at Osu only.
    const customer = await person();
    const at = (placeId: string) => ({
      place_id: placeId,
      customer_id: customer.id,
      requested_time: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const { data: bookings, error } = await service
      .from("place_booking")
      .insert([at(osu), at(legon)] as never)
      .select("id, place_id");
    expect(error).toBeNull();
    const { data: seen } = await desk.client
      .from("place_booking")
      .select("place_id")
      .in("place_id", [osu, legon]);
    expect((seen ?? []).map((b) => b.place_id)).toEqual([osu]);
    const legonBooking = (bookings ?? []).find((b) => b.place_id === legon);
    const { data: changed } = await desk.client
      .from("place_booking")
      .update({ status: "accepted" })
      .eq("id", legonBooking?.id as string)
      .select("id");
    expect(changed ?? []).toEqual([]);
    const osuBooking = (bookings ?? []).find((b) => b.place_id === osu);
    const { data: accepted } = await desk.client
      .from("place_booking")
      .update({ status: "accepted" })
      .eq("id", osuBooking?.id as string)
      .select("status");
    expect(accepted).toEqual([{ status: "accepted" }]);

    // Door staff limited to East Legon scan only its events' tickets.
    await setTeamMemberPlacesCore(svc, owner.id, {
      teamId,
      userId: door.id,
      placeIds: [legon],
    });
    const atOsu = await createTestEventWithTicketType(service, owner.id, {
      quantity: 5,
      price: 0,
    });
    const atLegon = await createTestEventWithTicketType(service, owner.id, {
      quantity: 5,
      price: 0,
    });
    eventIds.push(atOsu.eventId, atLegon.eventId);
    await service
      .from("event")
      .update({ organizer_id: teamId, place_id: osu } as never)
      .eq("id", atOsu.eventId);
    await service
      .from("event")
      .update({ organizer_id: teamId, place_id: legon } as never)
      .eq("id", atLegon.eventId);
    const ticketFor = async (ticketTypeId: string) => {
      const { data } = await service
        .from("ticket")
        .insert({
          ticket_type_id: ticketTypeId,
          user_id: customer.id,
          issued_to: customer.id,
          status: "active",
          ticket_code: `TKT-${crypto.randomUUID().slice(0, 8)}`,
          qr_public_id: "test/qr",
          qr_version: "1",
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        } as never)
        .select("id")
        .single();
      return (data as { id: string }).id;
    };
    const osuTicket = await ticketFor(atOsu.ticketTypeId);
    const legonTicket = await ticketFor(atLegon.ticketTypeId);
    const { data: scannable } = await door.client
      .from("ticket")
      .select("id")
      .in("id", [osuTicket, legonTicket]);
    expect((scannable ?? []).map((t) => t.id)).toEqual([legonTicket]);

    // A new role that is not limited lifts the limit.
    await setTeamMemberRoleCore(svc, owner.id, {
      teamId,
      userId: desk.id,
      role: "manager",
    });
    const { count } = await service
      .from("team_member_place")
      .select("place_id", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("user_id", desk.id);
    expect(count).toBe(0);
  });
});
