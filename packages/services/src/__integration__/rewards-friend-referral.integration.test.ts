import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Abonten Rewards Phase 5 -- friend invites through the real code: a new
// account binds to an inviter's code (bindReferralCodeCore), gets welcome
// credit once their phone is verified, spends it on a first ticket order
// (createMultiCheckoutPaymentAttemptCore / finalizePaystackPayment with
// Paystack's HTTP calls mocked), and the reward engine turns the friend's
// qualifying action into a pending reward for the inviter that settlement
// releases -- or a refund voids.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { issueRefundCore } from "../organizer/issueRefundCore";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePaystackPayment } from "../payments/finalizePaystackPayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import {
  bindReferralCodeCore,
  getReferralInviteCore,
  resolveReferralCodeCore,
} from "../rewards/inviteCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const paystack = vi.hoisted(() => ({
  verifyTransaction: vi.fn(),
  initializeTransaction: vi.fn(),
  refundTransaction: vi.fn(),
}));

vi.mock("../payments/gateway/paystackService", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifyTransaction: paystack.verifyTransaction,
  initializeTransaction: paystack.initializeTransaction,
  refundTransaction: paystack.refundTransaction,
}));

type SettingsRow =
  Database["public"]["Tables"]["reward_program_setting"]["Row"];
type Args<F extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][F]["Args"];
type RewardEvent = Database["public"]["Tables"]["reward_event"]["Row"];

describe("friend invites: binding, welcome credit and the inviter's reward", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let admin: TestUser;
  let inviter: TestUser;
  let inviterCode: string;
  let originalSettings: SettingsRow;
  const activeBefore = new Map<string, string | null>();
  const users: TestUser[] = [];
  const paymentMethods = new Map<string, string>();
  const placeIds: string[] = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  const deps: PaymentFulfillmentDeps = {
    issueTickets: async (sessionId, transactionId, metadata, auth) => {
      const { data: rows } = await service
        .from("ticket_checkout")
        .select("id, ticket_type_id, quantity, status")
        .eq("checkout_session_id", sessionId)
        .eq("user_id", auth.userId);
      if ((rows ?? []).every((r) => r.status === "paid"))
        return { status: 200 };
      const tickets = (rows ?? []).flatMap((r) =>
        Array.from({ length: r.quantity }, () => ({
          checkout_id: r.id,
          ticket_type_id: r.ticket_type_id,
          ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
          qr_public_id: "test/qr",
          qr_version: "1",
        })),
      );
      const { error } = await service.rpc("issue_tickets_for_checkout", {
        p_checkout_session_id: sessionId,
        p_user_id: auth.userId,
        p_transaction_id: transactionId,
        p_metadata: JSON.parse(metadata),
        p_ticket_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        p_tickets: tickets,
      } as unknown as Args<"issue_tickets_for_checkout">);
      return error ? { status: 500, message: error.message } : { status: 200 };
    },
    activatePlacePromotion: async () => ({ status: 500, message: "not used" }),
    activateEventPromotion: async () => ({ status: 500, message: "not used" }),
  };

  async function setSettings(patch: Partial<SettingsRow>) {
    const { error } = await service
      .from("reward_program_setting")
      .update(patch)
      .eq("id", 1);
    expect(error).toBeNull();
  }

  async function newUser(opts: { phone?: boolean } = {}): Promise<TestUser> {
    const user = await createTestUser(service);
    users.push(user);
    if (opts.phone) await verifyPhone(user);
    const { data } = await service
      .from("payment_method")
      .insert({
        user_id: user.id,
        method_type: "card",
        details: { brand: "visa", last4: "4081" },
        status: "active",
      })
      .select("id")
      .single();
    paymentMethods.set(user.id, data?.id as string);
    return user;
  }

  async function verifyPhone(user: TestUser) {
    const { error } = await service.auth.admin.updateUserById(user.id, {
      phone: `23324${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
      phone_confirm: true,
    });
    expect(error).toBeNull();
  }

  async function newEvent(ownerId = organizer.id) {
    return createTestEventWithTicketType(service, ownerId, {
      quantity: 20,
      price: 50,
    });
  }

  /** Buys 2 × GH₵ 50 (GH₵ 105 with the fee), optionally using credit. */
  async function buy(
    user: TestUser,
    event: { eventId: string; ticketTypeId: string },
    opts: { useCredit?: boolean } = {},
  ) {
    const opened = await validateCheckoutCore(user.client, user.id, {
      eventId: event.eventId,
      quantities: { [event.ticketTypeId]: 2 },
    });
    expect(opened.status).toBe(200);
    const sessionId = opened.checkoutSessionId as string;

    const res = await createMultiCheckoutPaymentAttemptCore(
      user.client,
      user.id,
      user.email,
      {
        checkoutSessionIds: [sessionId],
        paymentMethodId: paymentMethods.get(user.id),
        useCredit: opts.useCredit ?? false,
      },
      (id) => `https://example.test/checkout/${id}`,
      deps,
    );
    expect(res.status).toBe(200);
    if (res.status !== 200) throw new Error("payment attempt failed");
    const cashMinor = res.data.credit?.cashMinor ?? 10_500;
    paystack.verifyTransaction.mockResolvedValueOnce({
      id: 1,
      status: "success",
      reference: res.data.paystack?.reference as string,
      amount: cashMinor,
      currency: "GHS",
      gateway_response: "Approved",
      fees: 146,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      channel: "card",
      customer: { email: user.email },
      authorization: {
        signature: `SIG_${crypto.randomUUID()}`,
        last4: "4081",
        channel: "card",
      },
    });
    const done = await finalizePaystackPayment(res.data.attempts[0].id, deps);
    expect(done.status).toBe("succeeded");

    const { data: checkout } = await service
      .from("ticket_checkout")
      .select("id")
      .eq("checkout_session_id", sessionId)
      .single();
    const { data: attempt } = await service
      .from("payment_attempt")
      .select("transaction_id")
      .eq("id", res.data.attempts[0].id)
      .single();
    return {
      checkoutId: checkout?.id as string,
      transactionId: attempt?.transaction_id as string,
      creditMinor: res.data.credit?.appliedMinor ?? 0,
    };
  }

  async function runEngine() {
    const { error } = await service.rpc("rewards_process_outbox", {
      p_limit: 500,
    });
    expect(error).toBeNull();
  }

  async function settle() {
    const { data, error } = await service.rpc("rewards_settle_due", {
      p_limit: 500,
    });
    expect(error).toBeNull();
    return data as Record<string, number>;
  }

  async function inviteRewards(referee: TestUser): Promise<RewardEvent[]> {
    const { data } = await service
      .from("reward_event")
      .select("*")
      .eq("rule_key", "friend_referral_referrer")
      .eq("buyer_user_id", referee.id)
      .order("created_at");
    return data ?? [];
  }

  async function welcomeOf(referee: TestUser): Promise<RewardEvent | null> {
    const { data } = await service
      .from("reward_event")
      .select("*")
      .eq("rule_key", "friend_referral_referee")
      .eq("beneficiary_user_id", referee.id)
      .maybeSingle();
    return data;
  }

  async function referralOf(referee: TestUser) {
    const { data } = await service
      .from("user_referral")
      .select("*")
      .eq("referee_user_id", referee.id)
      .maybeSingle();
    return data;
  }

  async function makeDue(id: string) {
    await service
      .from("reward_event")
      .update({ release_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", id);
  }

  async function account(userId: string) {
    const { data } = await service
      .from("credit_account")
      .select("available_minor, pending_minor")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      available: Number(data?.available_minor ?? 0),
      pending: Number(data?.pending_minor ?? 0),
    };
  }

  async function spendable(userId: string, scope: string, total?: number) {
    const { data } = await service.rpc("credit_spendable", {
      p_user_id: userId,
      p_scope: scope,
      ...(total === undefined ? {} : { p_order_total_minor: total }),
    });
    return Number((data as { spendable_minor?: number }).spendable_minor ?? 0);
  }

  async function codeOf(user: TestUser): Promise<string> {
    const invite = await getReferralInviteCore(user.id);
    return invite.data?.code as string;
  }

  const bind = (user: TestUser, code: string) =>
    bindReferralCodeCore(user.id, { code, source: "typed" });

  /** A new user with a verified phone, bound to the owner of `code`. */
  async function boundFriend(code: string): Promise<TestUser> {
    const friend = await newUser({ phone: true });
    const res = await bind(friend, code);
    expect(res.data.result).toBe("bound");
    return friend;
  }

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, admin, inviter] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
    await verifyPhone(inviter);
    await service
      .from("user_info")
      .update({ full_name: "Ama Kusi Mensah" })
      .eq("id", inviter.id);
    await service
      .from("user_info")
      .update({ is_admin: true })
      .eq("id", admin.id);

    const { data } = await service
      .from("reward_program_setting")
      .select("*")
      .eq("id", 1)
      .single();
    originalSettings = data as SettingsRow;
    await setSettings({
      rewards_enabled: true,
      audience: "all",
      referral_capture_enabled: true,
      shadow_mode: false,
      risk_weights: {},
      redeem_tickets_enabled: true,
      allow_full_credit_ticket_orders: false,
      max_credit_share_of_ticket_order_bps: 10000,
      min_cash_charge_minor: 100,
    });

    // A test version of the inviter's rule with small caps, so the monthly
    // cap and the organizer path can be reached with a few purchases.
    // Versions are immutable and can't be deleted; the test DB keeps it.
    const { data: rules } = await service
      .from("reward_rule")
      .select("id, rule_key, version, is_active")
      .in("rule_key", ["friend_referral_referrer", "friend_referral_referee"])
      .order("version");
    for (const key of ["friend_referral_referrer", "friend_referral_referee"]) {
      activeBefore.set(
        key,
        rules?.find((r) => r.rule_key === key && r.is_active)?.id ?? null,
      );
    }
    const latest = Math.max(
      ...(rules ?? [])
        .filter((r) => r.rule_key === "friend_referral_referrer")
        .map((r) => r.version),
    );
    const { data: testRule, error } = await service
      .from("reward_rule")
      .insert({
        rule_key: "friend_referral_referrer",
        version: latest + 1,
        is_active: false,
        flat_minor: 300,
        min_basis_minor: 3000,
        caps: {
          per_referrer_month_count: 2,
          lifetime_review_count: 50,
          qualify_within_days: 60,
          bind_within_days: 7,
          organizer_unique_buyers: 2,
          claim_release_days: 14,
        },
        release_policy: "event_settled",
        lot_kind: "reward",
        spend_scope: "any",
        expiry_days: 365,
        note: "integration test caps",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    await service.rpc("reward_rule_set_active", {
      p_rule_key: "friend_referral_referrer",
      p_rule_id: testRule?.id as string,
    });
    await service.rpc("reward_rule_set_active", {
      p_rule_key: "friend_referral_referee",
      p_rule_id: rules?.find(
        (r) => r.rule_key === "friend_referral_referee" && r.version === 1,
      )?.id as string,
    });

    inviterCode = await codeOf(inviter);
  });

  afterAll(async () => {
    for (const [key, id] of activeBefore) {
      await service.rpc("reward_rule_set_active", {
        p_rule_key: key,
        p_rule_id: id as string,
      });
    }
    await setSettings({
      rewards_enabled: originalSettings.rewards_enabled,
      audience: originalSettings.audience,
      referral_capture_enabled: originalSettings.referral_capture_enabled,
      shadow_mode: originalSettings.shadow_mode,
      risk_weights: originalSettings.risk_weights,
      redeem_tickets_enabled: originalSettings.redeem_tickets_enabled,
      allow_full_credit_ticket_orders:
        originalSettings.allow_full_credit_ticket_orders,
      max_credit_share_of_ticket_order_bps:
        originalSettings.max_credit_share_of_ticket_order_bps,
      min_cash_charge_minor: originalSettings.min_cash_charge_minor,
    });
    await service
      .from("payment_method")
      .delete()
      .in("id", [...paymentMethods.values()]);
    if (placeIds.length > 0) {
      await service.from("place").delete().in("id", placeIds);
    }
    await Promise.all(
      [organizer, admin, inviter, ...users].map((u) =>
        deleteTestUser(service, u.id),
      ),
    );
  });

  beforeEach(() => {
    paystack.verifyTransaction.mockReset();
    paystack.initializeTransaction.mockReset();
    paystack.refundTransaction.mockReset();
    paystack.initializeTransaction.mockImplementation(
      async (p: { reference: string }) => ({
        reference: p.reference,
        access_code: "test-access",
        authorization_url: "https://checkout.paystack.test/x",
      }),
    );
    paystack.refundTransaction.mockResolvedValue({ status: "pending" });
  });

  afterEach(async () => {
    const { data } = await service.rpc("credit_reconciliation_checks");
    expect(data).toMatchObject({
      credit_unbalanced_journals: 0,
      credit_balance_cache_drift: 0,
      credit_lot_bucket_drift: 0,
      credit_lot_invalid_state: 0,
    });
  });

  it("shows the inviter their link and the offer, and resolves the code publicly", async () => {
    const invite = await getReferralInviteCore(
      inviter.id,
      "https://abontenhub.test",
    );
    expect(invite.data).toMatchObject({
      enabled: true,
      code: inviterCode,
      inviteUrl: `https://abontenhub.test/invite/${inviterCode}`,
      referrerMinor: 300,
      refereeMinor: 200,
      minOrderMinor: 3000,
      canBind: true,
    });

    const resolved = await resolveReferralCodeCore(
      inviterCode.toLowerCase(),
      null,
    );
    expect(resolved.data).toMatchObject({
      valid: true,
      programOn: true,
      referrerName: "Ama K.",
      welcomeMinor: 200,
    });
    expect((await resolveReferralCodeCore("ZZZZZZZ", null)).data?.valid).toBe(
      false,
    );
  });

  it("binds a new account once and refuses own codes, circles, old or active accounts", async () => {
    const friend = await newUser();
    const first = await bind(friend, inviterCode.toLowerCase());
    expect(first.status).toBe(200);
    expect(first.data).toEqual({
      result: "bound",
      referrerName: "Ama K.",
      welcome: "needs_phone",
      welcomeMinor: 200,
    });
    expect(await referralOf(friend)).toMatchObject({
      referrer_user_id: inviter.id,
      code: inviterCode,
      source: "typed",
      status: "bound",
    });
    // No phone yet: no welcome credit yet.
    expect(await welcomeOf(friend)).toBeNull();

    const other = await newUser();
    const again = await bind(friend, await codeOf(other));
    expect(again.data).toMatchObject({
      result: "already_bound",
      referrerName: "Ama K.",
    });

    expect((await bind(inviter, inviterCode)).data.result).toBe("own_code");
    // The inviter is new too, but can't join with their own friend's code.
    expect((await bind(inviter, await codeOf(friend))).data.result).toBe(
      "circular",
    );

    const old = await newUser();
    await service
      .from("user_info")
      .update({
        created_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      })
      .eq("id", old.id);
    expect((await bind(old, inviterCode)).data.result).toBe("too_late");

    const organizerFriend = await newUser();
    await newEvent(organizerFriend.id);
    expect((await bind(organizerFriend, inviterCode)).data.result).toBe(
      "not_new",
    );

    expect((await bind(other, "ZZZZZZZ")).data.result).toBe("unknown_code");
    const invalid = await bind(other, "abc");
    expect(invalid.status).toBe(400);
    expect(invalid.data.result).toBe("invalid");

    const stats = await getReferralInviteCore(inviter.id);
    expect(stats.data?.stats.joined).toBeGreaterThanOrEqual(1);
    const mine = await getReferralInviteCore(friend.id);
    expect(mine.data).toMatchObject({
      invitedBy: { name: "Ama K." },
      canBind: false,
    });
  });

  it("gives welcome credit once the friend's phone is verified, for a first order of GH₵ 30+ only", async () => {
    const friend = await newUser();
    expect((await bind(friend, inviterCode)).data.welcome).toBe("needs_phone");
    await verifyPhone(friend);

    const run = await settle();
    expect(run.welcome_granted).toBeGreaterThanOrEqual(1);
    expect(await welcomeOf(friend)).toMatchObject({
      status: "released",
      is_shadow: false,
      amount_minor: 200,
      released_minor: 200,
      source_type: "user_referral",
    });
    expect((await account(friend.id)).available).toBe(200);

    const { data: lot } = await service
      .from("credit_lot")
      .select("kind, spend_scope, status, expires_at")
      .eq("user_id", friend.id)
      .single();
    expect(lot).toMatchObject({
      kind: "welcome",
      spend_scope: "first_order",
      status: "active",
    });
    const days =
      (Date.parse(lot?.expires_at as string) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);

    // Only on a first ticket order of at least GH₵ 30.
    expect(await spendable(friend.id, "tickets", 2_000)).toBe(0);
    expect(await spendable(friend.id, "tickets", 10_500)).toBe(200);
    expect(await spendable(friend.id, "tickets")).toBe(0);
    expect(await spendable(friend.id, "promotions")).toBe(0);

    const { data: note } = await service
      .from("notification")
      .select("type, body")
      .eq("user_id", friend.id)
      .eq("type", "welcome_credit")
      .single();
    expect(note?.body).toContain("GH₵ 2.00");
    expect(note?.body).toContain("GH₵ 30.00");

    // A second sweep grants nothing twice.
    await settle();
    expect((await account(friend.id)).available).toBe(200);
  });

  it("pays the inviter after the friend's first order settles, and the welcome credit pays part of it", async () => {
    const friend = await boundFriend(inviterCode);
    expect((await account(friend.id)).available).toBe(200);
    const before = await account(inviter.id);

    const bought = await buy(friend, await newEvent(), { useCredit: true });
    expect(bought.creditMinor).toBe(200);
    // Used up: a second order isn't a first order.
    expect(await spendable(friend.id, "tickets", 10_500)).toBe(0);

    await runEngine();
    await runEngine(); // a second pass changes nothing
    const [reward] = await inviteRewards(friend);
    expect(reward).toMatchObject({
      status: "pending",
      is_shadow: false,
      amount_minor: 300,
      beneficiary_user_id: inviter.id,
      source_type: "ticket_checkout",
      source_id: bought.checkoutId,
    });
    expect(reward.basis).toMatchObject({
      path: "first_order",
      order_minor: 10_000,
    });
    expect(await referralOf(friend)).toMatchObject({
      status: "qualified",
      qualified_via: "first_order",
      reward_event_id: reward.id,
    });
    expect((await account(inviter.id)).pending).toBe(before.pending + 300);

    const { data: joined } = await service
      .from("notification")
      .select("type")
      .eq("user_id", inviter.id)
      .in("type", ["referral_joined", "referral_qualified"]);
    expect(new Set((joined ?? []).map((n) => n.type))).toEqual(
      new Set(["referral_joined", "referral_qualified"]),
    );

    await makeDue(reward.id);
    await settle();
    expect((await inviteRewards(friend))[0]).toMatchObject({
      status: "released",
      released_minor: 300,
    });
    expect((await referralOf(friend))?.status).toBe("rewarded");
    const after = await account(inviter.id);
    expect(after.available).toBe(before.available + 300);
    expect(after.pending).toBe(before.pending);
  });

  it("voids the reward when the qualifying order is refunded; a later order can still qualify", async () => {
    const friend = await boundFriend(inviterCode);
    const first = await buy(friend, await newEvent());
    await runEngine();
    expect((await inviteRewards(friend))[0]?.status).toBe("pending");

    expect((await issueRefundCore(service, first.transactionId)).status).toBe(
      200,
    );
    await runEngine();
    expect((await inviteRewards(friend))[0]).toMatchObject({
      status: "voided",
      status_reason: "refunded",
    });
    expect(await referralOf(friend)).toMatchObject({
      status: "bound",
      reward_event_id: null,
    });

    await buy(friend, await newEvent());
    await runEngine();
    const rewards = await inviteRewards(friend);
    expect(rewards).toHaveLength(2);
    expect(rewards[1].status).toBe("pending");
  });

  it("rejects an invite reward when the friend buys the inviter's own tickets", async () => {
    const organizerInviter = await newUser({ phone: true });
    const code = await codeOf(organizerInviter);
    const friend = await boundFriend(code);

    await buy(friend, await newEvent(organizerInviter.id));
    await runEngine();
    const [reward] = await inviteRewards(friend);
    expect(reward).toMatchObject({
      status: "rejected",
      status_reason: "risk",
      amount_minor: 0,
      lot_id: null,
    });
    expect(reward.risk_flags).toContain("organizer_linked");
    expect((await referralOf(friend))?.status).toBe("rejected");
  });

  it("qualifies an organizer friend whose event sells to enough verified buyers, and a friend whose place claim is approved", async () => {
    const inviter2 = await newUser({ phone: true });
    const code = await codeOf(inviter2);

    // Path (2): the friend's own event sells to 2 unique verified buyers
    // (the test rule's threshold).
    const organizerFriend = await boundFriend(code);
    const theirEvent = await newEvent(organizerFriend.id);
    await buy(await newUser({ phone: true }), theirEvent);
    await runEngine();
    expect(await inviteRewards(organizerFriend)).toHaveLength(0);
    await buy(await newUser({ phone: true }), theirEvent);
    await runEngine();
    const [sales] = await inviteRewards(organizerFriend);
    expect(sales).toMatchObject({
      status: "pending",
      source_type: "event",
      source_id: theirEvent.eventId,
      amount_minor: 300,
    });
    expect(sales.basis).toMatchObject({
      path: "organizer_sales",
      unique_buyers: 2,
    });
    await makeDue(sales.id);
    await settle();
    expect((await inviteRewards(organizerFriend))[0].status).toBe("released");

    // Path (3): an admin approves the friend's claim on a place.
    const claimer = await boundFriend(code);
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place } = await service
      .from("place")
      .insert({
        owner_id: organizer.id,
        name: "Friend Referral Test Place",
        slug: `friend-referral-place-${crypto.randomUUID()}`,
        description: "Created by the friend referral integration suite.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra", country: "Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      } as never)
      .select("id")
      .single();
    placeIds.push(place?.id as string);

    // A claimant can't file a claim that's already approved.
    const forged = await claimer.client.from("place_claim_request").insert({
      place_id: place?.id as string,
      claimant_id: claimer.id,
      status: "approved",
    } as never);
    expect(forged.error).not.toBeNull();

    const { data: claim, error: claimError } = await claimer.client
      .from("place_claim_request")
      .insert({
        place_id: place?.id as string,
        claimant_id: claimer.id,
      } as never)
      .select("id")
      .single();
    expect(claimError).toBeNull();
    const { error: approveError } = await service.rpc("approve_place_claim", {
      p_request_id: claim?.id as string,
      p_admin_id: admin.id,
    });
    expect(approveError).toBeNull();
    await runEngine();
    const [claimed] = await inviteRewards(claimer);
    expect(claimed).toMatchObject({
      status: "pending",
      source_type: "place_claim",
      source_id: claim?.id,
    });
    const releaseInDays =
      (Date.parse(claimed.release_at as string) - Date.now()) / 86_400_000;
    expect(releaseInDays).toBeGreaterThan(13);
    expect(releaseInDays).toBeLessThan(15);

    // The test rule allows 2 invite rewards a month: a third is refused.
    const third = await boundFriend(code);
    await buy(third, await newEvent());
    await runEngine();
    expect((await inviteRewards(third))[0]).toMatchObject({
      status: "rejected",
      status_reason: "referrer_cap",
    });
  });

  it("in shadow mode records the welcome credit and the reward but posts no credit", async () => {
    await setSettings({ shadow_mode: true });
    try {
      const shadowInviter = await newUser({ phone: true });
      const friend = await boundFriend(await codeOf(shadowInviter));
      expect(await welcomeOf(friend)).toMatchObject({
        status: "released",
        is_shadow: true,
        lot_id: null,
      });
      expect((await account(friend.id)).available).toBe(0);

      await buy(friend, await newEvent());
      await runEngine();
      expect((await inviteRewards(friend))[0]).toMatchObject({
        status: "pending",
        is_shadow: true,
        lot_id: null,
      });
      expect(await account(shadowInviter.id)).toEqual({
        available: 0,
        pending: 0,
      });
    } finally {
      await setSettings({ shadow_mode: false });
    }
  });

  it("gives no welcome credit to a friend on the inviter's own device", async () => {
    const friend = await newUser();
    const installId = `install-${crypto.randomUUID()}`;
    for (const userId of [inviter.id, friend.id]) {
      await service.rpc("record_device_install", {
        p_install_id: installId,
        p_user_id: userId,
        p_platform: "android",
      });
    }
    await bind(friend, inviterCode);
    await verifyPhone(friend);
    await settle();
    const welcome = await welcomeOf(friend);
    expect(welcome).toMatchObject({
      status: "rejected",
      status_reason: "risk",
    });
    expect(welcome?.risk_flags).toContain("shared_device");
    expect((await account(friend.id)).available).toBe(0);
  });

  it("does nothing while invites are off", async () => {
    await setSettings({ referral_capture_enabled: false });
    try {
      const friend = await newUser();
      expect((await bind(friend, inviterCode)).data.result).toBe("capture_off");
      expect((await getReferralInviteCore(friend.id)).data).toMatchObject({
        enabled: false,
        code: null,
        canBind: false,
      });
    } finally {
      await setSettings({ referral_capture_enabled: true });
    }
  });

  it("keeps clients out of binding and the invite functions", async () => {
    const friend = await boundFriend(inviterCode);
    const calls = await Promise.all([
      friend.client.rpc("referral_bind", {
        p_referee: friend.id,
        p_code: inviterCode,
        p_source: "typed",
      }),
      friend.client.rpc("referral_stats", { p_user_id: inviter.id }),
      friend.client.rpc("referral_resolve_code", { p_code: inviterCode }),
      friend.client.rpc("credit_spendable", {
        p_user_id: friend.id,
        p_scope: "tickets",
      }),
    ]);
    for (const { error } of calls) expect(error?.code).toBe("42501");

    const write = await friend.client.from("user_referral").insert({
      referee_user_id: friend.id,
      referrer_user_id: friend.id,
      code: inviterCode,
      source: "typed",
    } as never);
    expect(write.error).not.toBeNull();

    // A friend sees their own row (who invited them) and no one else's.
    const { data: rows } = await friend.client
      .from("user_referral")
      .select("referee_user_id, referrer_user_id");
    expect(rows).toEqual([
      { referee_user_id: friend.id, referrer_user_id: inviter.id },
    ]);
  });
});
