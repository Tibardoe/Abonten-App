import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Moving one's own events into a team (docs/architecture/team-accounts.md
// §4f2): an Owner moves an event, or a whole run of shows, with its seating
// plan and the conversations about it, while nobody has bought or
// registered. Managers can't, part of a run can't, sold events can't, a
// seating plan shared with an event that stays can't, and "make this a
// team" now moves runs and seating plans too.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  answerTeamInviteCore,
  convertAccountToTeamCore,
  createTeamCore,
  getMoveEventToTeamOptionsCore,
  inviteTeamMemberCore,
  moveEventToTeamCore,
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

describe("moving events into a team", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  const teamIds: string[] = [];
  const eventIds: string[] = [];
  const planIds: string[] = [];
  let owner: TestUser;
  let manager: TestUser;
  let fan: TestUser;
  let teamId: string;

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `tm_${u.id.slice(0, 8)}`, full_name: "Move Person" })
      .eq("id", u.id);
    return u;
  }

  async function eventOf(organizerId: string): Promise<string> {
    const { eventId } = await createTestEventWithTicketType(
      service,
      organizerId,
      { quantity: 10, price: 0 },
    );
    eventIds.push(eventId);
    return eventId;
  }

  async function runOf(organizerId: string, count: number) {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) ids.push(await eventOf(organizerId));
    const { data: series, error } = await service
      .from("event_series")
      .insert({ organizer_id: organizerId })
      .select("id")
      .single();
    if (error || !series) throw new Error(error?.message);
    const { error: linkError } = await service
      .from("event")
      .update({ series_id: series.id })
      .in("id", ids);
    if (linkError) throw new Error(linkError.message);
    return { ids, seriesId: series.id as string };
  }

  async function planFor(ownerId: string, eventIdsToSeat: string[]) {
    const { data: plan, error } = await service
      .from("seating_plan")
      .insert({ owner_id: ownerId, name: "Main hall" })
      .select("id")
      .single();
    if (error || !plan) throw new Error(error?.message);
    planIds.push(plan.id);
    for (const id of eventIdsToSeat) {
      const { error: seatError } = await service
        .from("event_seating")
        .insert({ event_id: id, plan_id: plan.id });
      if (seatError) throw new Error(seatError.message);
    }
    return plan.id as string;
  }

  async function organizerOf(id: string): Promise<string> {
    const { data } = await service
      .from("event")
      .select("organizer_id")
      .eq("id", id)
      .single();
    return (data as { organizer_id: string }).organizer_id;
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
    manager = await person();
    fan = await person();
    const made = await createTeamCore(svc, owner.id, {
      adult: true,
      name: "Move Crew",
      username: `tmc_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamId = made.data.id;
    teamIds.push(teamId);
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role: "manager",
        target: { kind: "username", username: `tm_${manager.id.slice(0, 8)}` },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    const joined = await answerTeamInviteCore(svc, manager.id, {
      adult: true,
      inviteId: sent.data.id,
      action: "accept",
    });
    if (joined.status !== 200) throw new Error(joined.message);
  });

  afterAll(async () => {
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    for (const id of eventIds) {
      await service.from("ticket_checkout").delete().eq("event_id", id);
      await service.from("conversation").delete().eq("event_id", id);
      await service.from("event_seating").delete().eq("event_id", id);
      await deleteTestEvent(service, id).catch(() => undefined);
    }
    if (planIds.length)
      await service.from("seating_plan").delete().in("id", planIds);
    const accounts = [...teamIds, ...users.map((u) => u.id)];
    await service.from("event_series").delete().in("organizer_id", accounts);
    for (const id of teamIds) {
      await service.auth.admin.deleteUser(id).catch(() => undefined);
    }
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("offers the teams the person owns, and how much would move", async () => {
    const { ids } = await runOf(owner.id, 3);
    const res = await getMoveEventToTeamOptionsCore(svc, owner.id, ids[1]);
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.data.teams.map((t) => t.id)).toEqual([teamId]);
    expect(res.data.eventCount).toBe(3);
    expect(res.data.hasSales).toBe(false);

    // A Manager owns no team: nothing to offer for their own event.
    const theirs = await eventOf(manager.id);
    const forManager = await getMoveEventToTeamOptionsCore(
      svc,
      manager.id,
      theirs,
    );
    expect(forManager.status === 200 && forManager.data.teams).toEqual([]);

    // Somebody else's event: not found.
    const other = await getMoveEventToTeamOptionsCore(svc, fan.id, ids[0]);
    expect(other.status).toBe(404);
  });

  it("moves a whole run, its seating plan and its conversations", async () => {
    const { ids, seriesId } = await runOf(owner.id, 2);
    const planId = await planFor(owner.id, ids);
    const { data: conversation, error } = await service
      .from("conversation")
      .insert({ type: "event", event_id: ids[0], created_by: fan.id })
      .select("id")
      .single();
    if (error || !conversation) throw new Error(error?.message);
    await service.from("conversation_participant").insert([
      { conversation_id: conversation.id, user_id: fan.id, role: "member" },
      {
        conversation_id: conversation.id,
        user_id: owner.id,
        role: "organizer",
      },
    ]);

    const res = await moveEventToTeamCore(svc, owner.id, {
      eventId: ids[1],
      teamId,
    });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.data.events).toBe(2);

    for (const id of ids) expect(await organizerOf(id)).toBe(teamId);
    const { data: series } = await service
      .from("event_series")
      .select("organizer_id")
      .eq("id", seriesId)
      .single();
    expect(series?.organizer_id).toBe(teamId);
    const { data: plan } = await service
      .from("seating_plan")
      .select("owner_id")
      .eq("id", planId)
      .single();
    expect(plan?.owner_id).toBe(teamId);
    const { data: parts } = await service
      .from("conversation_participant")
      .select("user_id")
      .eq("conversation_id", conversation.id);
    const who = (parts ?? []).map((p) => p.user_id);
    expect(who).toContain(teamId);
    expect(who).not.toContain(owner.id);

    const { data: activity } = await service
      .from("team_activity")
      .select("action, actor_user_id")
      .eq("team_id", teamId)
      .eq("action", "events.moved_in");
    expect(activity?.[0]?.actor_user_id).toBe(owner.id);
  });

  it("refuses part of a run, a Manager, and an event with sales", async () => {
    const { ids } = await runOf(owner.id, 2);
    const part = await service.rpc("team_move_events", {
      p_team: teamId,
      p_person: owner.id,
      p_event_ids: [ids[0]],
    });
    expect(part.error?.message).toContain("team:whole_run");

    const managers = await eventOf(manager.id);
    const notOwner = await moveEventToTeamCore(svc, manager.id, {
      eventId: managers,
      teamId,
    });
    expect(notOwner.status).toBe(403);
    expect(await organizerOf(managers)).toBe(manager.id);

    const sold = await eventOf(owner.id);
    const { data: type } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", sold)
      .single();
    const { error: checkoutError } = await service
      .from("ticket_checkout")
      .insert({
        user_id: fan.id,
        event_id: sold,
        ticket_type_id: type?.id,
        quantity: 1,
        unit_price: 0,
        total_price: 0,
        status: "pending",
      } as never);
    if (checkoutError) throw new Error(checkoutError.message);
    const options = await getMoveEventToTeamOptionsCore(svc, owner.id, sold);
    expect(options.status === 200 && options.data.hasSales).toBe(true);
    const refused = await moveEventToTeamCore(svc, owner.id, {
      eventId: sold,
      teamId,
    });
    expect(refused.status).toBe(409);
    expect(await organizerOf(sold)).toBe(owner.id);
  });

  it("refuses when an event that stays shares the seating plan", async () => {
    const moving = await eventOf(owner.id);
    const staying = await eventOf(owner.id);
    await planFor(owner.id, [moving, staying]);
    const res = await moveEventToTeamCore(svc, owner.id, {
      eventId: moving,
      teamId,
    });
    expect(res.status).toBe(409);
    expect(await organizerOf(moving)).toBe(owner.id);
  });

  it("make this a team moves runs and seating plans too", async () => {
    const convert = await person();
    const { ids, seriesId } = await runOf(convert.id, 2);
    const planId = await planFor(convert.id, ids);
    const res = await convertAccountToTeamCore(svc, convert.id, {
      name: "Converted Crew",
      adult: true,
    });
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    teamIds.push(res.data.team.id);
    const { data: series } = await service
      .from("event_series")
      .select("organizer_id")
      .eq("id", seriesId)
      .single();
    expect(series?.organizer_id).toBe(res.data.team.id);
    const { data: plan } = await service
      .from("seating_plan")
      .select("owner_id")
      .eq("id", planId)
      .single();
    expect(plan?.owner_id).toBe(res.data.team.id);
  });
});
