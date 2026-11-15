import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts, stage 3 (docs/architecture/team-accounts.md §4b): Owners
// and Finance see and move a team's money, nobody else does; a team's new
// payout account takes payouts after 48 hours; a payout account change
// needs a fresh sign-in and tells every Owner; notices written to a team
// reach the members whose role covers them.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { removePayoutAccountCore } from "../organizer/payoutAccountCore";
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
const HOURS = 3_600_000;

describe("a team's money", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  let owner: TestUser;
  let finance: TestUser;
  let manager: TestUser;
  let outsider: TestUser;
  let teamId: string;
  let eventId: string;
  let oldAccount: string;
  let newAccount: string;
  let payoutId: string;

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `tm_${u.id.slice(0, 8)}`, full_name: "Money Person" })
      .eq("id", u.id);
    return u;
  }

  async function join(who: TestUser, role: "finance" | "manager") {
    const sent = await inviteTeamMemberCore(
      svc,
      owner.id,
      {
        teamId,
        role,
        target: { kind: "username", username: `tm_${who.id.slice(0, 8)}` },
      },
      noText,
    );
    if (sent.status !== 200) throw new Error(sent.message);
    const res = await answerTeamInviteCore(svc, who.id, {
      inviteId: sent.data.id,
      action: "accept",
    });
    if (res.status !== 200) throw new Error(res.message);
  }

  async function payoutAccount(createdAt: Date, number: string) {
    const { data, error } = await service
      .from("payout_account")
      .insert({
        organizer_id: teamId,
        account_type: "mobile_money",
        account_holder_name: "Team Account",
        account_number: number,
        provider: "MTN",
        country_code: "GH",
        currency: "GHS",
        created_at: createdAt.toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
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
    [finance, manager, outsider] = await Promise.all([
      person(),
      person(),
      person(),
    ]);
    const made = await createTeamCore(svc, owner.id, {
      name: "Money Crew",
      username: `tmt_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamId = made.data.id;
    await join(finance, "finance");
    await join(manager, "manager");

    ({ eventId } = await createTestEventWithTicketType(service, teamId, {
      quantity: 10,
      price: 0,
    }));
    oldAccount = await payoutAccount(
      new Date(Date.now() - 72 * HOURS),
      "0551112222",
    );
    newAccount = await payoutAccount(new Date(), "0553334444");

    const { data: payout, error } = await service
      .from("payout")
      .insert({
        organizer_id: teamId,
        payout_account_id: oldAccount,
        amount: 5,
        currency: "GHS",
        reference: `PYT-T${crypto.randomUUID().slice(0, 8)}`,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    payoutId = payout.id;
    await service.from("organizer_ledger_entry").insert({
      organizer_id: teamId,
      payout_id: payoutId,
      entry_type: "payout_hold",
      amount: -5,
      currency: "GHS",
    });
  });

  afterAll(async () => {
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    await service
      .from("organizer_ledger_entry")
      .delete()
      .eq("organizer_id", teamId);
    await service.from("payout").delete().eq("organizer_id", teamId);
    await service.from("payout_account").delete().eq("organizer_id", teamId);
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await service.from("notification").delete().eq("user_id", teamId);
    await service.auth.admin.deleteUser(teamId).catch(() => undefined);
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("Owners and Finance read the team's balance; others are refused", async () => {
    const read = (who: TestUser) =>
      who.client.rpc("get_organizer_finance_overview", {
        p_account: teamId,
      });
    expect((await read(owner)).error).toBeNull();
    expect((await read(finance)).error).toBeNull();
    expect((await read(manager)).error?.message).toMatch(/not allowed/i);
    expect((await read(outsider)).error?.message).toMatch(/not allowed/i);
    // Without an account named, a person still reads their own.
    expect(
      (await manager.client.rpc("get_organizer_finance_overview")).error,
    ).toBeNull();
  });

  it("the team's ledger and payouts are Finance's to see, not a Manager's", async () => {
    const ledger = (who: TestUser) =>
      who.client
        .from("organizer_ledger_entry")
        .select("id")
        .eq("organizer_id", teamId);
    expect((await ledger(finance)).data).toHaveLength(1);
    expect((await ledger(manager)).data ?? []).toHaveLength(0);
    const payouts = (who: TestUser) =>
      who.client.from("payout").select("id").eq("organizer_id", teamId);
    expect((await payouts(finance)).data).toHaveLength(1);
    expect((await payouts(manager)).data ?? []).toHaveLength(0);
  });

  it("a payout waits 48 hours on a new account, and only Owners and Finance ask", async () => {
    const ask = (who: TestUser, account: string) =>
      who.client.rpc("request_organizer_payout", {
        p_payout_account_id: account,
        p_amount: 10,
        p_currency: "GHS",
        p_account: teamId,
      });
    expect((await ask(finance, newAccount)).error?.message).toMatch(/too new/i);
    // Past the role and the wait: only the balance stops it now.
    expect((await ask(finance, oldAccount)).error?.message).toMatch(
      /exceeds available balance/i,
    );
    expect((await ask(manager, oldAccount)).error?.message).toMatch(
      /not allowed/i,
    );
  });

  it("an event is cancelled for a team by an Owner, not by Finance", async () => {
    const { error: byFinance } = await finance.client.rpc(
      "get_event_cancellation_impact",
      { p_event_id: eventId, p_account: teamId },
    );
    expect(byFinance?.message).toMatch(/not allowed/i);
    const { error: byOwner } = await owner.client.rpc(
      "get_event_cancellation_impact",
      { p_event_id: eventId, p_account: teamId },
    );
    expect(byOwner).toBeNull();
  });

  it("a payout account change needs a fresh sign-in and tells every Owner", async () => {
    const actor = {
      personId: owner.id,
      accountId: teamId,
      role: "owner" as const,
    };
    const stale = await removePayoutAccountCore(
      owner.client,
      teamId,
      newAccount,
      { ...actor, signedInAt: Date.now() - 60 * 60_000 },
    );
    expect(stale.status).toBe(403);

    const fresh = await removePayoutAccountCore(
      owner.client,
      teamId,
      newAccount,
      { ...actor, signedInAt: Date.now() },
    );
    expect(fresh.status).toBe(200);

    const { data: activity } = await service
      .from("team_activity")
      .select("action, actor_user_id")
      .eq("team_id", teamId)
      .eq("action", "payout_account_removed");
    expect(activity?.[0]?.actor_user_id).toBe(owner.id);

    const { data: notices } = await service
      .from("notification")
      .select("user_id, data")
      .eq("type", "team_payout_account_removed")
      .in("user_id", [owner.id, finance.id, manager.id]);
    expect(notices?.map((n) => n.user_id)).toEqual([owner.id]);
    expect((notices?.[0]?.data as { team_id?: string }).team_id).toBe(teamId);
  });

  it("notices to a team reach the members whose role covers them", async () => {
    await service.from("notification").insert({
      user_id: teamId,
      type: "place_booking_requested",
      title: "New booking request",
      data: { kind: "place_booking" },
    });
    const { data } = await service
      .from("notification")
      .select("user_id")
      .eq("type", "place_booking_requested")
      .in("user_id", [owner.id, finance.id, manager.id]);
    expect(new Set(data?.map((n) => n.user_id))).toEqual(
      new Set([owner.id, manager.id]),
    );
  });
});
