import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Abonten Rewards Phase 4 -- event referrals end to end through the real
// code: a referral link is opened (touch), the buyer opens a checkout
// (attribution stamped), pays (finalizePaystackPayment with Paystack's HTTP
// calls mocked), the reward engine evaluates the sale from its outbox, and
// settlement releases -- or a refund voids -- the reward.
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
  getReferralLinkCore,
  recordReferralTouchCore,
} from "../rewards/referralCore";
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

describe("event referrals: capture, attribution and the reward engine", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let referrer: TestUser;
  let originalSettings: SettingsRow;
  let activeRuleBefore: string | null;
  let ruleId: string;
  let referrerCode: string;
  const buyers: TestUser[] = [];
  const paymentMethods: string[] = [];

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

  async function newBuyer(): Promise<{ user: TestUser; methodId: string }> {
    const user = await createTestUser(service);
    buyers.push(user);
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
    paymentMethods.push(data?.id as string);
    return { user, methodId: data?.id as string };
  }

  async function slugOf(eventId: string): Promise<string> {
    const { data } = await service
      .from("event")
      .select("event_code")
      .eq("id", eventId)
      .single();
    return (data?.event_code as string).toLowerCase();
  }

  /** Buyer opens a checkout (2 × GH₵ 50) carrying the given hint, then pays. */
  async function buyThroughLink(
    buyer: { user: TestUser; methodId: string },
    eventId: string,
    ticketTypeId: string,
    hint: { code: string; touchedAt?: string } | null,
    fingerprint?: Record<string, unknown>,
  ) {
    const slug = await slugOf(eventId);
    const opened = await validateCheckoutCore(
      buyer.user.client,
      buyer.user.id,
      {
        eventId,
        quantities: { [ticketTypeId]: 2 },
        referralHints: hint
          ? [
              {
                code: hint.code,
                touchedAt: hint.touchedAt ?? new Date().toISOString(),
                eventSlug: slug,
              },
            ]
          : [],
      },
    );
    expect(opened.status).toBe(200);
    const sessionId = opened.checkoutSessionId as string;

    const res = await createMultiCheckoutPaymentAttemptCore(
      buyer.user.client,
      buyer.user.id,
      buyer.user.email,
      { checkoutSessionIds: [sessionId], paymentMethodId: buyer.methodId },
      (id) => `https://example.test/checkout/${id}`,
      deps,
    );
    expect(res.status).toBe(200);
    if (res.status !== 200) throw new Error("payment attempt failed");
    const reference = res.data.paystack?.reference as string;
    paystack.verifyTransaction.mockResolvedValueOnce({
      id: 1,
      status: "success",
      reference,
      amount: 10_500,
      currency: "GHS",
      gateway_response: "Approved",
      fees: 146,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      channel: "card",
      customer: { email: buyer.user.email },
      authorization: fingerprint ?? {
        signature: `SIG_${crypto.randomUUID()}`,
        last4: "4081",
        channel: "card",
      },
    });
    const done = await finalizePaystackPayment(res.data.attempts[0].id, deps);
    expect(done.status).toBe("succeeded");

    const { data: checkout } = await service
      .from("ticket_checkout")
      .select("id, referrer_user_id, referral_code")
      .eq("checkout_session_id", sessionId)
      .single();
    const { data: attempt } = await service
      .from("payment_attempt")
      .select("transaction_id")
      .eq("id", res.data.attempts[0].id)
      .single();
    return {
      checkoutId: checkout?.id as string,
      stampedReferrer: checkout?.referrer_user_id ?? null,
      transactionId: attempt?.transaction_id as string,
    };
  }

  async function runEngine() {
    const { error } = await service.rpc("rewards_process_outbox", {
      p_limit: 500,
    });
    expect(error).toBeNull();
  }

  async function rewardFor(checkoutId: string): Promise<RewardEvent | null> {
    const { data } = await service
      .from("reward_event")
      .select("*")
      .eq("source_id", checkoutId)
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

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, referrer] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    // Live credit only unlocks for a referrer with a verified phone.
    await service.auth.admin.updateUserById(referrer.id, {
      phone: `23355${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
      phone_confirm: true,
    });

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
    });

    const { data: rules } = await service
      .from("reward_rule")
      .select("id, version, is_active")
      .eq("rule_key", "event_referral")
      .order("version");
    activeRuleBefore = rules?.find((r) => r.is_active)?.id ?? null;
    ruleId = rules?.[0]?.id as string;
    await service.rpc("reward_rule_set_active", {
      p_rule_key: "event_referral",
      p_rule_id: ruleId,
    });

    const link = await getReferralLinkCore(referrer.id);
    expect(link.data?.captureEnabled).toBe(true);
    referrerCode = link.data?.code as string;
    expect(referrerCode).toMatch(/^[ABCDEFGHJKMNP-Z2-9]{7}$/);
  });

  afterAll(async () => {
    await service.rpc("reward_rule_set_active", {
      p_rule_key: "event_referral",
      p_rule_id: activeRuleBefore as string,
    });
    await setSettings({
      rewards_enabled: originalSettings.rewards_enabled,
      audience: originalSettings.audience,
      referral_capture_enabled: originalSettings.referral_capture_enabled,
      shadow_mode: originalSettings.shadow_mode,
      risk_weights: originalSettings.risk_weights,
    });
    await service.from("payment_method").delete().in("id", paymentMethods);
    await Promise.all(
      [organizer, referrer, ...buyers].map((u) =>
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

  it("keeps the same code for a user and records touches, but not your own", async () => {
    const again = await getReferralLinkCore(referrer.id);
    expect(again.data?.code).toBe(referrerCode);

    const { eventId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      {
        quantity: 10,
        price: 50,
      },
    );
    const visitor = await newBuyer();
    const recorded = await recordReferralTouchCore({
      code: referrerCode.toLowerCase(),
      eventSlug: await slugOf(eventId),
      visitorUserId: visitor.user.id,
      ip: "203.0.113.7",
      userAgent: "test",
      platform: "web",
    });
    expect(recorded).toEqual({ status: 202, result: "recorded" });

    const { data: attribution } = await service
      .from("referral_attribution")
      .select("referrer_user_id, code")
      .eq("user_id", visitor.user.id)
      .eq("event_id", eventId)
      .single();
    expect(attribution).toEqual({
      referrer_user_id: referrer.id,
      code: referrerCode,
    });

    const { data: touch } = await service
      .from("referral_touch")
      .select("ip_hash, event_id")
      .eq("visitor_user_id", visitor.user.id)
      .single();
    expect(touch?.event_id).toBe(eventId);
    expect(touch?.ip_hash).not.toContain("203.0.113.7");

    const own = await recordReferralTouchCore({
      code: referrerCode,
      eventId,
      visitorUserId: referrer.id,
      platform: "web",
    });
    expect(own.result).toBe("own_code");
  });

  it("stamps the referrer, accrues a pending reward, then releases it once the event settles", async () => {
    const { eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 10, price: 50 },
    );
    const buyer = await newBuyer();
    const bought = await buyThroughLink(buyer, eventId, ticketTypeId, {
      code: referrerCode,
    });
    expect(bought.stampedReferrer).toBe(referrer.id);

    // The attribution can't be changed afterwards, even by the server.
    const tamper = await service
      .from("ticket_checkout")
      .update({ referrer_user_id: buyer.user.id })
      .eq("id", bought.checkoutId);
    expect(tamper.error?.message).toMatch(/cannot be changed/);

    const before = await account(referrer.id);
    await runEngine();
    await runEngine(); // a second pass changes nothing
    const reward = await rewardFor(bought.checkoutId);
    // 1% of GH₵ 100 = 100 pesewas; 35% of the sale's GH₵ 3.54 net revenue
    // is 123, so the rate decides.
    expect(reward).toMatchObject({
      status: "pending",
      is_shadow: false,
      decision: "auto",
      amount_minor: 100,
      beneficiary_user_id: referrer.id,
      buyer_user_id: buyer.user.id,
    });
    expect(reward?.basis).toMatchObject({
      ticket_revenue_minor: 10_000,
      net_revenue_share_minor: 354,
      limited_by: "rate",
    });
    expect(reward?.lot_id).not.toBeNull();
    expect((await account(referrer.id)).pending).toBe(before.pending + 100);

    await makeDue(reward?.id as string);
    const { data: settled } = await service.rpc("rewards_settle_due", {
      p_limit: 500,
    });
    expect(settled).toMatchObject({ released: 1 });
    expect(await rewardFor(bought.checkoutId)).toMatchObject({
      status: "released",
      released_minor: 100,
    });
    const after = await account(referrer.id);
    expect(after.available).toBe(before.available + 100);
    expect(after.pending).toBe(before.pending);

    const { data: notes } = await service
      .from("notification")
      .select("type, body")
      .eq("user_id", referrer.id)
      .eq("type", "reward_available");
    expect(notes?.[0]?.body).toContain("GH₵ 1.00");
  });

  it("voids the pending reward when the referred order is refunded", async () => {
    const { eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 10, price: 50 },
    );
    const buyer = await newBuyer();
    const bought = await buyThroughLink(buyer, eventId, ticketTypeId, {
      code: referrerCode,
    });
    await runEngine();
    const before = await account(referrer.id);
    expect((await rewardFor(bought.checkoutId))?.status).toBe("pending");

    const refund = await issueRefundCore(service, bought.transactionId);
    expect(refund.status).toBe(200);
    await runEngine();

    expect(await rewardFor(bought.checkoutId)).toMatchObject({
      status: "voided",
      status_reason: "refunded",
    });
    expect((await account(referrer.id)).pending).toBe(before.pending - 100);
  });

  it("never stamps the buyer's own code, the organizer's, or a stale link", async () => {
    const { eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      referrer.id, // the referrer organizes this one
      { quantity: 10, price: 50 },
    );
    const buyer = await newBuyer();
    const organizerCode = await buyThroughLink(buyer, eventId, ticketTypeId, {
      code: referrerCode,
    });
    expect(organizerCode.stampedReferrer).toBeNull();

    const other = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
      price: 50,
    });
    const stale = await buyThroughLink(
      buyer,
      other.eventId,
      other.ticketTypeId,
      {
        code: referrerCode,
        touchedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
      },
    );
    expect(stale.stampedReferrer).toBeNull();

    const buyerCode = (await getReferralLinkCore(buyer.user.id)).data
      ?.code as string;
    const { data: own } = await service.rpc("stamp_checkout_referral", {
      p_checkout_session_id: crypto.randomUUID(),
      p_user_id: buyer.user.id,
      p_code: buyerCode,
      p_touched_at: new Date().toISOString(),
      p_source: "link",
    });
    expect(own).toBe("own_code");
  });

  it("holds a risky sale for review and releases it only after approval", async () => {
    // Weighted so "same device" (20) + "new buyer account" (15) lands in the
    // 30-69 review band instead of being rejected outright.
    await setSettings({ risk_weights: { shared_device: 20 } });
    const { eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 10, price: 50 },
    );
    const buyer = await newBuyer();
    const installId = `install-${crypto.randomUUID()}`;
    for (const userId of [referrer.id, buyer.user.id]) {
      await service.rpc("record_device_install", {
        p_install_id: installId,
        p_user_id: userId,
        p_platform: "android",
      });
    }

    const bought = await buyThroughLink(buyer, eventId, ticketTypeId, {
      code: referrerCode,
    });
    await runEngine();
    const held = await rewardFor(bought.checkoutId);
    expect(held).toMatchObject({
      status: "held",
      decision: "review",
      risk_score: 35,
    });
    expect(held?.risk_flags).toEqual(
      expect.arrayContaining(["shared_device", "new_buyer_account"]),
    );

    await makeDue(held?.id as string);
    await service.rpc("rewards_settle_due", { p_limit: 500 });
    expect((await rewardFor(bought.checkoutId))?.status).toBe("held");

    const { error } = await service.rpc("reward_review_decision", {
      p_reward_event_id: held?.id as string,
      p_admin_id: organizer.id,
      p_approve: true,
      p_note: "Checked: family member on a shared phone",
    });
    expect(error).toBeNull();
    await service.rpc("rewards_settle_due", { p_limit: 500 });
    expect((await rewardFor(bought.checkoutId))?.status).toBe("released");
    await setSettings({ risk_weights: {} });
  });

  it("rejects a sale paid with the referrer's own card", async () => {
    const { eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 10, price: 50 },
    );
    // The referrer once paid with this card...
    const card = {
      signature: `SIG_${crypto.randomUUID()}`,
      last4: "1111",
      channel: "card",
    };
    await service.from("transaction").insert({
      user_id: referrer.id,
      full_name: "Referrer",
      email: referrer.email,
      reason: "Ticket_Purchase",
      amount: 1,
      currency: "GHS",
      status: "successful",
      payment_method: "paystack",
      paystack_reference: `FP-${crypto.randomUUID()}`,
      payment_gateway_response: { authorization: card },
    });
    // ...and the "friend" pays with it too.
    const buyer = await newBuyer();
    const bought = await buyThroughLink(
      buyer,
      eventId,
      ticketTypeId,
      { code: referrerCode },
      card,
    );
    await runEngine();
    expect(await rewardFor(bought.checkoutId)).toMatchObject({
      status: "rejected",
      decision: "reject",
      amount_minor: 0,
      lot_id: null,
    });
  });

  it("in shadow mode records the decision but posts no credit", async () => {
    await setSettings({ shadow_mode: true });
    const { eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 10, price: 50 },
    );
    const buyer = await newBuyer();
    const before = await account(referrer.id);
    const bought = await buyThroughLink(buyer, eventId, ticketTypeId, {
      code: referrerCode,
    });
    await runEngine();
    const shadow = await rewardFor(bought.checkoutId);
    expect(shadow).toMatchObject({
      status: "pending",
      is_shadow: true,
      amount_minor: 100,
      lot_id: null,
    });
    await makeDue(shadow?.id as string);
    await service.rpc("rewards_settle_due", { p_limit: 500 });
    expect((await rewardFor(bought.checkoutId))?.status).toBe("released");
    expect(await account(referrer.id)).toEqual(before);
    await setSettings({ shadow_mode: false });
  });

  it("does nothing while the rule is switched off", async () => {
    await service.rpc("reward_rule_set_active", {
      p_rule_key: "event_referral",
      p_rule_id: null as unknown as string,
    });
    const { eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 10, price: 50 },
    );
    const buyer = await newBuyer();
    const bought = await buyThroughLink(buyer, eventId, ticketTypeId, {
      code: referrerCode,
    });
    await runEngine();
    expect(await rewardFor(bought.checkoutId)).toBeNull();
    await service.rpc("reward_rule_set_active", {
      p_rule_key: "event_referral",
      p_rule_id: ruleId,
    });
  });

  it("keeps clients out of the engine and the referral tables", async () => {
    const [buyer] = buyers;
    const reads = await Promise.all([
      buyer.client.from("reward_event").select("id"),
      buyer.client.from("referral_touch").select("id"),
      buyer.client.from("referral_attribution").select("user_id"),
      buyer.client.from("device_install").select("user_id"),
      buyer.client.from("reward_outbox").select("id"),
    ]);
    for (const { error } of reads) expect(error?.code).toBe("42501");

    const writes = await Promise.all([
      buyer.client
        .from("referral_code")
        .insert({ code: "AAAAAAA", user_id: buyer.id } as never),
      buyer.client.rpc("stamp_checkout_referral", {
        p_checkout_session_id: crypto.randomUUID(),
        p_user_id: buyer.id,
        p_code: referrerCode,
        p_touched_at: new Date().toISOString(),
        p_source: "link",
      }),
      buyer.client.rpc("rewards_process_outbox", { p_limit: 1 }),
      buyer.client.rpc("referral_ensure_code", { p_user_id: buyer.id }),
    ]);
    for (const { error } of writes) expect(error?.code).toBe("42501");

    // Their own code is readable, nobody else's.
    const { data: codes } = await buyer.client
      .from("referral_code")
      .select("user_id");
    expect((codes ?? []).every((c) => c.user_id === buyer.id)).toBe(true);
  });
});
