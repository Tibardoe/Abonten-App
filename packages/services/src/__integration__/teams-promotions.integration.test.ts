import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Team accounts, stage 4b (docs/architecture/team-accounts.md §4d): Owners
// and Finance feature the team's events and places; the member pays the
// cash part, the TEAM's credit pays the credit part; a member who no longer
// buys features for the team cannot spend its credit; a team counts in the
// Rewards audience when one of its Owners does; notices about the team's
// features and credit reach the right members and open the team's pages.
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createPromotionPaymentAttemptCore } from "../payments/createPromotionPaymentAttemptCore";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import { insertPlacePromotionCheckoutCore } from "../places/placePromotionCore";
import { insertEventPromotionCheckoutCore } from "../promotions/insertEventPromotionCheckoutCore";
import { getPromotionCreditQuoteCore } from "../rewards/creditRedemptionCore";
import { resolveActingAccount } from "../teams/actingAccount";
import {
  answerTeamInviteCore,
  createTeamCore,
  inviteTeamMemberCore,
} from "../teams/teamCore";
import { recordTeamMoneyEventFor } from "../teams/teamMoney";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// No provider is reached: every purchase here is paid in full with credit.
vi.mock("../payments/providers/paystackApi", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifyTransaction: vi.fn(),
  refundTransaction: vi.fn(),
}));

type SettingsRow =
  Database["public"]["Tables"]["reward_program_setting"]["Row"];

const TIER_ID = 1; // seeded: "24 hours", GH₵ 20 (events and places)
const TIER_PRICE_MINOR = 2000;
const noText = { canTextNumber: async () => false };
const key = (label: string) => `test:${label}:${crypto.randomUUID()}`;

describe("featuring a team's listings with the team's credit", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  let owner: TestUser;
  let finance: TestUser;
  let manager: TestUser;
  let teamId: string;
  let eventId: string;
  let placeId: string;
  let originalRewards: SettingsRow;
  const eventCheckouts: string[] = [];
  const placeCheckouts: string[] = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  // The web app injects activateEventPromotion; this stand-in does the same
  // two writes (featured row + checkout paid) through the service role.
  const deps: PaymentFulfillmentDeps = {
    issueTickets: async () => ({ status: 500, message: "not used" }),
    activatePlacePromotion: async () => ({ status: 500, message: "not used" }),
    activateEventPromotion: async (checkoutId) => {
      const { data: checkout } = await service
        .from("event_promotion_checkout")
        .select("id, event_id, tier_id, status")
        .eq("id", checkoutId)
        .maybeSingle();
      if (!checkout || checkout.status !== "pending") {
        return { status: 410, message: "This checkout has expired." };
      }
      const now = new Date();
      await service.from("event_promotion").insert({
        event_id: checkout.event_id,
        tier_id: checkout.tier_id,
        starts_at: now.toISOString(),
        ends_at: new Date(now.getTime() + 86_400_000).toISOString(),
        promotion_checkout_id: checkout.id,
      });
      await service
        .from("event_promotion_checkout")
        .update({ status: "paid", completed_at: now.toISOString() })
        .eq("id", checkout.id);
      return { status: 200 };
    },
  };

  async function person(): Promise<TestUser> {
    const u = await createTestUser(service);
    users.push(u);
    await service
      .from("user_info")
      .update({ username: `tp_${u.id.slice(0, 8)}`, full_name: "Promo Person" })
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
        target: { kind: "username", username: `tp_${who.id.slice(0, 8)}` },
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

  async function grant(userId: string, amount: number) {
    const { error } = await service.rpc("credit_grant", {
      p_user_id: userId,
      p_amount_minor: amount,
      p_journal_type: "bonus.grant",
      p_lot_kind: "promotion",
      p_spend_scope: "promotions",
      p_idempotency_key: key("grant"),
    });
    expect(error).toBeNull();
  }

  async function available(userId: string) {
    const { data } = await service
      .from("credit_account")
      .select("available_minor, reserved_minor")
      .eq("user_id", userId)
      .maybeSingle();
    return data ?? { available_minor: 0, reserved_minor: 0 };
  }

  async function teamEventCheckout(who: TestUser): Promise<string> {
    const res = await insertEventPromotionCheckoutCore(
      who.client,
      who.id,
      eventId,
      TIER_ID,
      teamId,
    );
    if (res.status !== 200) throw new Error(res.message);
    eventCheckouts.push(res.checkoutId);
    return res.checkoutId;
  }

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    await service
      .from("team_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();
    const { data } = await service
      .from("reward_program_setting")
      .select("*")
      .eq("id", 1)
      .single();
    originalRewards = data as SettingsRow;
    await service
      .from("reward_program_setting")
      .update({
        rewards_enabled: true,
        audience: "all",
        redeem_promotions_enabled: true,
      })
      .eq("id", 1);

    owner = await person();
    [finance, manager] = await Promise.all([person(), person()]);
    const made = await createTeamCore(svc, owner.id, {
      name: "Promo Crew",
      username: `tpt_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamId = made.data.id;
    await join(finance, "finance");
    await join(manager, "manager");

    ({ eventId } = await createTestEventWithTicketType(service, teamId, {
      quantity: 10,
    }));
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
        name: "Promo Rooftop",
        slug: `promo-rooftop-${crypto.randomUUID()}`,
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

  afterEach(async () => {
    const { data, error } = await service.rpc("credit_reconciliation_checks");
    expect(error).toBeNull();
    expect(
      Object.values((data ?? {}) as Record<string, number>).every(
        (n) => n === 0,
      ),
    ).toBe(true);
  });

  afterAll(async () => {
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    await service
      .from("reward_program_setting")
      .update({
        rewards_enabled: originalRewards.rewards_enabled,
        audience: originalRewards.audience,
        beta_user_ids: originalRewards.beta_user_ids,
        redeem_promotions_enabled: originalRewards.redeem_promotions_enabled,
      })
      .eq("id", 1);
    if (eventCheckouts.length > 0) {
      await service
        .from("event_promotion")
        .delete()
        .in("promotion_checkout_id", eventCheckouts);
      await service
        .from("payment_attempt")
        .delete()
        .in("event_promotion_checkout_id", eventCheckouts);
      await service
        .from("event_promotion_checkout")
        .delete()
        .in("id", eventCheckouts);
    }
    if (placeCheckouts.length > 0) {
      await service
        .from("place_promotion_checkout")
        .delete()
        .in("id", placeCheckouts);
    }
    await service.from("place").delete().eq("id", placeId);
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await service.from("notification").delete().eq("user_id", teamId);
    await service.auth.admin.deleteUser(teamId).catch(() => undefined);
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("lets Owners and Finance feature the team's listings, and nobody else", async () => {
    const checkoutId = await teamEventCheckout(finance);
    const { data: row } = await service
      .from("event_promotion_checkout")
      .select("owner_id, account_id, total_price")
      .eq("id", checkoutId)
      .single();
    // The member pays; the checkout says which team it is for.
    expect(row).toEqual({
      owner_id: finance.id,
      account_id: teamId,
      total_price: 20,
    });

    const place = await insertPlacePromotionCheckoutCore(
      owner.client,
      owner.id,
      placeId,
      TIER_ID,
      teamId,
    );
    expect(place.status).toBe(200);
    if (place.status === 200) placeCheckouts.push(place.checkoutId);

    // A Manager runs the event but does not spend the team's money.
    const managerActs = await resolveActingAccount(
      svc,
      manager.id,
      teamId,
      "promotions.buy",
    );
    expect(managerActs.ok).toBe(false);
    // Nobody features a team's event as themselves.
    const asSelf = await insertEventPromotionCheckoutCore(
      finance.client,
      finance.id,
      eventId,
      TIER_ID,
    );
    expect(asSelf.status).toBe(403);
    // Nor can a client write a checkout, naming a team or not.
    const { error: clientWrite } = await finance.client
      .from("event_promotion_checkout")
      .insert({
        event_id: eventId,
        owner_id: finance.id,
        account_id: teamId,
        tier_id: TIER_ID,
        unit_price: 0,
        total_price: 0,
        currency: "GHS",
      });
    expect(clientWrite).not.toBeNull();
  });

  it("pays with the team's credit, never the member's own", async () => {
    await grant(teamId, 3000);
    await grant(finance.id, 5000);
    const teamBefore = await available(teamId);
    const mineBefore = await available(finance.id);
    const checkoutId = await teamEventCheckout(finance);

    const quote = await getPromotionCreditQuoteCore(
      finance.client,
      finance.id,
      { kind: "event", checkoutId },
    );
    expect(quote).toMatchObject({
      status: 200,
      data: {
        offered: true,
        spendableMinor: teamBefore.available_minor,
        creditMinor: TIER_PRICE_MINOR,
        creditOnly: true,
        accountName: "Promo Crew",
      },
    });

    const res = await createPromotionPaymentAttemptCore(
      finance.client,
      finance.id,
      finance.email,
      { kind: "event", checkoutId, useCredit: true },
      (id) => `test://${id}`,
      deps,
    );
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.data.verification?.status).toBe(200);

    expect((await available(teamId)).available_minor).toBe(
      teamBefore.available_minor - TIER_PRICE_MINOR,
    );
    expect((await available(finance.id)).available_minor).toBe(
      mineBefore.available_minor,
    );
    const { data: attempt } = await service
      .from("payment_attempt")
      .select("user_id, status")
      .eq("id", res.data.attempt.id)
      .single();
    expect(attempt).toEqual({ user_id: finance.id, status: "succeeded" });
    const { data: reservation } = await service
      .from("credit_reservation")
      .select("user_id, status")
      .eq("payment_attempt_id", res.data.attempt.id)
      .single();
    expect(reservation).toEqual({ user_id: teamId, status: "captured" });
    const { count } = await service
      .from("event_promotion")
      .select("id", { count: "exact", head: true })
      .eq("promotion_checkout_id", checkoutId);
    expect(count).toBe(1);
  });

  it("stops a member who no longer buys features from spending the team's credit", async () => {
    await grant(teamId, 3000);
    const checkoutId = await teamEventCheckout(finance);
    await service
      .from("team_member")
      .update({ role: "manager" })
      .eq("team_id", teamId)
      .eq("user_id", finance.id);
    try {
      const quote = await getPromotionCreditQuoteCore(
        finance.client,
        finance.id,
        { kind: "event", checkoutId },
      );
      expect(quote.status).toBe(404);
      const before = await available(teamId);
      const res = await createPromotionPaymentAttemptCore(
        finance.client,
        finance.id,
        finance.email,
        { kind: "event", checkoutId, useCredit: true },
        (id) => `test://${id}`,
        deps,
      );
      expect(res.status).toBe(404);
      expect((await available(teamId)).available_minor).toBe(
        before.available_minor,
      );
    } finally {
      await service
        .from("team_member")
        .update({ role: "finance" })
        .eq("team_id", teamId)
        .eq("user_id", finance.id);
    }
  });

  it("counts a team in the Rewards audience when one of its Owners is in it", async () => {
    const enabledFor = async (id: string) =>
      (await service.rpc("rewards_enabled_for_user", { p_user_id: id })).data;
    try {
      await service
        .from("reward_program_setting")
        .update({ audience: "beta", beta_user_ids: [owner.id] })
        .eq("id", 1);
      expect(await enabledFor(teamId)).toBe(true);
      // A member who is not an Owner does not bring the team in.
      await service
        .from("reward_program_setting")
        .update({ audience: "beta", beta_user_ids: [finance.id] })
        .eq("id", 1);
      expect(await enabledFor(finance.id)).toBe(true);
      expect(await enabledFor(teamId)).toBe(false);
    } finally {
      await service
        .from("reward_program_setting")
        .update({ audience: "all", beta_user_ids: [] })
        .eq("id", 1);
    }
  });

  it("tells the members who buy features, and opens the team's Finances for its credit", async () => {
    const { data: started } = await service
      .from("notification")
      .insert({
        user_id: teamId,
        type: "promotion_started",
        title: "Featured",
        body: "Your event is now featured.",
        link: `/manage/events/${eventId}`,
        data: { kind: "event_featured", eventId },
      })
      .select("id")
      .single();
    const { data: copies } = await service
      .from("notification")
      .select("user_id, link")
      .contains("data", { source_notification_id: started?.id });
    expect((copies ?? []).map((c) => c.user_id).sort()).toEqual(
      [owner.id, finance.id].sort(),
    );

    const { data: earned } = await service
      .from("notification")
      .insert({
        user_id: teamId,
        type: "promotion_credit_earned",
        title: "Credit",
        body: "You earned promotion credit.",
        link: "/rewards",
        data: { kind: "rewards" },
      })
      .select("id")
      .single();
    const { data: creditCopies } = await service
      .from("notification")
      .select("user_id, link")
      .contains("data", { source_notification_id: earned?.id });
    expect(creditCopies?.length).toBe(2);
    expect(new Set((creditCopies ?? []).map((c) => c.link))).toEqual(
      new Set(["/finances"]),
    );

    // Who bought a feature is in the team's activity.
    await recordTeamMoneyEventFor(svc, teamId, finance.id, {
      kind: "promotion_bought",
      subjectKind: "event",
      subjectId: eventId,
      title: "Integration Test Event",
    });
    const { data: activity } = await service
      .from("team_activity")
      .select("actor_user_id, subject_kind, subject_id")
      .eq("team_id", teamId)
      .eq("action", "promotion_bought")
      .single();
    expect(activity).toEqual({
      actor_user_id: finance.id,
      subject_kind: "event",
      subject_id: eventId,
    });
  });
});
