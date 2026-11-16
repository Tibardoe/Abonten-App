import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts, stage 2 (docs/architecture/team-accounts.md): members act
// for their team's events and places through the database's own access
// rules (public.acting_accounts), each within what their role covers, and
// resolveActingAccount refuses what a role does not cover.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getActingTeamsCore,
  resolveActingAccount,
} from "../teams/actingAccount";
import {
  answerTeamInviteCore,
  createTeamCore,
  inviteTeamMemberCore,
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

describe("acting for a team", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  let owner: TestUser;
  let manager: TestUser;
  let door: TestUser;
  let desk: TestUser;
  let outsider: TestUser;
  let teamId: string;
  let eventId: string;
  let ticketTypeId: string;
  let placeId: string;

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `ta_${u.id.slice(0, 8)}`, full_name: "Team Person" })
      .eq("id", u.id);
    return u;
  }

  async function join(
    who: TestUser,
    role: "manager" | "door" | "front_desk",
  ): Promise<void> {
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role,
        target: { kind: "username", username: `ta_${who.id.slice(0, 8)}` },
      },
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

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    await service
      .from("team_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();
    owner = await person();
    [manager, door, desk, outsider] = await Promise.all([
      person(),
      person(),
      person(),
      person(),
    ]);
    const made = await createTeamCore(svc, owner.id, {
      adult: true,
      name: "Acting Crew",
      username: `tat_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamId = made.data.id;
    await join(manager, "manager");
    await join(door, "door");
    await join(desk, "front_desk");

    ({ eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      teamId,
      { quantity: 20, price: 0 },
    ));
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place, error } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: teamId,
        name: "Team Lounge",
        slug: `team-lounge-${crypto.randomUUID()}`,
        description: "Run by a team.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra", country: "Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      } as never)
      .select("id")
      .single();
    if (error || !place) throw new Error(error?.message);
    placeId = (place as { id: string }).id;
  });

  afterAll(async () => {
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    await service.from("place_booking").delete().eq("place_id", placeId);
    await service.from("place").delete().eq("id", placeId);
    await service.from("attendance").delete().eq("event_id", eventId);
    await service.from("ticket").delete().eq("ticket_type_id", ticketTypeId);
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await service.auth.admin.deleteUser(teamId).catch(() => undefined);
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("a Manager edits the team's event; Door staff and outsiders cannot", async () => {
    const edit = (who: TestUser) =>
      who.client
        .from("event")
        .update({ description: `edited by ${who.id.slice(0, 4)}` })
        .eq("id", eventId)
        .select("id");
    expect((await edit(manager)).data).toHaveLength(1);
    expect((await edit(door)).data ?? []).toHaveLength(0);
    expect((await edit(outsider)).data ?? []).toHaveLength(0);
    expect((await edit(owner)).data).toHaveLength(1);
  });

  it("Door staff check a ticket in but never see the attendee list", async () => {
    const holder = await person();
    const code = `TKT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data: ticket } = await service
      .from("ticket")
      .insert({
        user_id: holder.id,
        ticket_type_id: ticketTypeId,
        status: "active",
        ticket_code: code,
        qr_public_id: "test/qr",
        qr_version: "1",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    await service.from("attendance").insert({
      user_id: holder.id,
      event_id: eventId,
      ticket_type_id: ticketTypeId,
      ticket_id: ticket?.id,
      status: "attending",
      number_of_tickets: 1,
      name: "Guest Name",
    });

    const { data: found } = await door.client
      .from("ticket")
      .select("id, status")
      .eq("ticket_code", code)
      .maybeSingle();
    expect(found?.id).toBe(ticket?.id);
    const { data: moved } = await door.client
      .from("ticket")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", ticket?.id ?? "")
      .eq("status", "active")
      .select("id");
    expect(moved).toHaveLength(1);

    const { data: doorList } = await door.client
      .from("attendance")
      .select("name")
      .eq("event_id", eventId);
    expect(doorList ?? []).toHaveLength(0);
    const { data: managerList } = await manager.client
      .from("attendance")
      .select("name")
      .eq("event_id", eventId);
    expect(managerList?.map((r) => r.name)).toContain("Guest Name");
  });

  it("the front desk answers a booking but cannot change the place", async () => {
    const customer = await person();
    const { data: booking } = await service
      .from("place_booking")
      .insert({
        place_id: placeId,
        customer_id: customer.id,
        status: "pending",
        party_size: 2,
        requested_time: new Date(Date.now() + 86_400_000).toISOString(),
      } as never)
      .select("id")
      .single();
    const bookingId = (booking as { id: string } | null)?.id ?? "";
    expect(bookingId).not.toBe("");

    const { data: answered } = await desk.client
      .from("place_booking")
      .update({ status: "accepted" } as never)
      .eq("id", bookingId)
      .select("id");
    expect(answered).toHaveLength(1);

    const { data: renamed } = await desk.client
      .from("place")
      .update({ description: "the desk tried" })
      .eq("id", placeId)
      .select("id");
    expect(renamed ?? []).toHaveLength(0);
    const { data: byManager } = await manager.client
      .from("place")
      .update({ description: "the manager did" })
      .eq("id", placeId)
      .select("id");
    expect(byManager).toHaveLength(1);
  });

  it("lists the teams a person may manage as, with their role", async () => {
    const forDoor = await getActingTeamsCore(svc, door.id);
    expect(forDoor.data.programEnabled).toBe(true);
    expect(forDoor.data.teams).toEqual([
      expect.objectContaining({
        id: teamId,
        name: "Acting Crew",
        role: "door",
      }),
    ]);
    const forOutsider = await getActingTeamsCore(svc, outsider.id);
    expect(forOutsider.data.teams).toEqual([]);
  });

  it("resolveActingAccount checks the membership and the role", async () => {
    const asManager = await resolveActingAccount(
      svc,
      manager.id,
      teamId,
      "events.manage",
    );
    expect(asManager.ok && asManager.actor.accountId).toBe(teamId);

    const doorEditing = await resolveActingAccount(
      svc,
      door.id,
      teamId,
      "events.manage",
    );
    expect(doorEditing.ok).toBe(false);
    const doorListing = await resolveActingAccount(svc, door.id, teamId, [
      "events.manage",
      "checkin.scan",
    ]);
    expect(doorListing.ok).toBe(true);

    const stranger = await resolveActingAccount(
      svc,
      outsider.id,
      teamId,
      "events.manage",
    );
    expect(stranger.ok).toBe(false);

    const self = await resolveActingAccount(
      svc,
      outsider.id,
      null,
      "money.view",
    );
    expect(self.ok && self.actor.accountId).toBe(outsider.id);
  });

  it("signed out, the rules still answer (an empty list of accounts)", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    const { error } = await anon.from("event").select("id").limit(1);
    expect(error).toBeNull();
  });
});
