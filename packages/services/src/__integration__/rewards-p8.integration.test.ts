import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Abonten Rewards Phase 8 through real ticket purchases (validateCheckoutCore /
// createMultiCheckoutPaymentAttemptCore / finalizePaystackPayment with
// Paystack's HTTP calls mocked): the loyalty fee rebate, organizer-funded
// promoter commissions (and what they do to the organizer's balance), and
// verified place visits with the monthly visits reward.
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
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePaystackPayment } from "../payments/finalizePaystackPayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import {
  getPlaceVisitPanelCore,
  recordPlaceVisitCore,
} from "../places/placeVisitCore";
import { getLoyaltyProgressCore } from "../rewards/loyaltyCore";
import {
  getEventPromoterCommissionCore,
  setEventPromoterCommissionCore,
} from "../rewards/promoterCommissionCore";
import { getReferralLinkCore } from "../rewards/referralCore";
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

const P8_RULES = [
  "loyalty_fee_rebate",
  "promoter_commission",
  "place_visits",
] as const;

// Where the test places are (Accra). ~0.001° of latitude ≈ 111 m.
const HERE = { lat: 5.6037, lng: -0.187 };

describe("Rewards Phase 8: loyalty, promoter commissions, place visits", () => {
  let service: SupabaseClient<Database>;
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

  async function setRule(key: string, live: boolean) {
    const { data } = await service
      .from("reward_rule")
      .select("id")
      .eq("rule_key", key)
      .eq("version", 1)
      .single();
    const { error } = await service.rpc("reward_rule_set_active", {
      p_rule_key: key,
      p_rule_id: (live ? data?.id : null) as string,
    });
    expect(error).toBeNull();
  }

  async function newUser(
    opts: { phone?: boolean; ageDays?: number } = {},
  ): Promise<TestUser> {
    const user = await createTestUser(service);
    users.push(user);
    if (opts.phone ?? true) {
      const { error } = await service.auth.admin.updateUserById(user.id, {
        phone: `23324${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
        phone_confirm: true,
      });
      expect(error).toBeNull();
    }
    if (opts.ageDays) {
      await service
        .from("user_info")
        .update({
          created_at: new Date(
            Date.now() - opts.ageDays * 86_400_000,
          ).toISOString(),
        })
        .eq("id", user.id);
    }
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

  const newEvent = (organizerId: string) =>
    createTestEventWithTicketType(service, organizerId, {
      quantity: 40,
      price: 50,
    });

  async function slugOf(eventId: string): Promise<string> {
    const { data } = await service
      .from("event")
      .select("event_code")
      .eq("id", eventId)
      .single();
    return (data?.event_code as string).toLowerCase();
  }

  /** Buys 2 × GH₵ 50 (GH₵ 105 with the 5% fee), optionally through a link. */
  async function buy(
    user: TestUser,
    event: { eventId: string; ticketTypeId: string },
    refCode?: string,
  ) {
    const opened = await validateCheckoutCore(user.client, user.id, {
      eventId: event.eventId,
      quantities: { [event.ticketTypeId]: 2 },
      referralHints: refCode
        ? [
            {
              code: refCode,
              touchedAt: new Date().toISOString(),
              eventSlug: await slugOf(event.eventId),
            },
          ]
        : [],
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
        useCredit: false,
      },
      (id) => `https://example.test/checkout/${id}`,
      deps,
    );
    expect(res.status).toBe(200);
    if (res.status !== 200) throw new Error("payment attempt failed");
    paystack.verifyTransaction.mockResolvedValueOnce({
      id: 1,
      status: "success",
      reference: res.data.paystack?.reference as string,
      amount: 10_500,
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
      .select("id, referrer_user_id")
      .eq("checkout_session_id", sessionId)
      .single();
    const { data: attempt } = await service
      .from("payment_attempt")
      .select("transaction_id")
      .eq("id", res.data.attempts[0].id)
      .single();
    return {
      checkoutId: checkout?.id as string,
      referrer: checkout?.referrer_user_id ?? null,
      transactionId: attempt?.transaction_id as string,
    };
  }

  async function runEngine() {
    const { error } = await service.rpc("rewards_process_outbox", {
      p_limit: 500,
    });
    expect(error).toBeNull();
  }

  async function settleDue() {
    const { error } = await service.rpc("rewards_settle_due", { p_limit: 500 });
    expect(error).toBeNull();
  }

  async function reward(
    checkoutId: string,
    ruleKey: string,
  ): Promise<RewardEvent | null> {
    const { data } = await service
      .from("reward_event")
      .select("*")
      .eq("source_id", checkoutId)
      .eq("rule_key", ruleKey)
      .maybeSingle();
    return data;
  }

  async function makeDue(id: string) {
    await service
      .from("reward_event")
      .update({ release_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", id);
  }

  async function available(userId: string) {
    const { data } = await service
      .from("credit_account")
      .select("available_minor")
      .eq("user_id", userId)
      .maybeSingle();
    return Number(data?.available_minor ?? 0);
  }

  /** Moves an event into the past (ended 4 days ago, so settled 2 days ago). */
  async function endEvent(eventId: string) {
    const startsAt = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const endsAt = new Date(Date.now() - 4 * 86_400_000).toISOString();
    await service
      .from("event")
      .update({ starts_at: startsAt, ends_at: endsAt })
      .eq("id", eventId);
    await service
      .from("event_occurrence")
      .update({ starts_at: startsAt, ends_at: endsAt })
      .eq("event_id", eventId);
  }

  async function commissionRows(checkoutId: string) {
    const { data } = await service
      .from("organizer_ledger_entry")
      .select("entry_type, amount")
      .eq("ticket_checkout_id", checkoutId)
      .in("entry_type", ["promoter_commission", "promoter_commission_reversal"])
      .order("created_at");
    return (data ?? []).map((r) => ({
      type: r.entry_type,
      amount: Number(r.amount),
    }));
  }

  async function newPlace(ownerId: string, verified: boolean) {
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place, error } = await service
      .from("place")
      .insert({
        owner_id: ownerId,
        name: "Visits Test Venue",
        slug: `visits-venue-${crypto.randomUUID()}`,
        description: "Created by the Phase 8 integration suite.",
        category_id: category?.id as number,
        location: `POINT(${HERE.lng} ${HERE.lat})`,
        address: { city: "Accra", country: "Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
        verified,
        claimed: verified,
      } as never)
      .select("id, slug")
      .single();
    expect(error).toBeNull();
    placeIds.push(place?.id as string);
    return { id: place?.id as string, slug: place?.slug as string };
  }

  beforeAll(async () => {
    service = getServiceClient();
    const { data } = await service
      .from("reward_program_setting")
      .select("*")
      .eq("id", 1)
      .single();
    originalSettings = data as SettingsRow;
    await setSettings({
      rewards_enabled: true,
      audience: "all",
      shadow_mode: false,
      referral_capture_enabled: true,
      risk_weights: {},
    });
    const { data: rules } = await service
      .from("reward_rule")
      .select("id, rule_key, is_active")
      .in("rule_key", [...P8_RULES]);
    for (const key of P8_RULES) {
      activeBefore.set(
        key,
        rules?.find((r) => r.rule_key === key && r.is_active)?.id ?? null,
      );
    }
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
      shadow_mode: originalSettings.shadow_mode,
      referral_capture_enabled: originalSettings.referral_capture_enabled,
      risk_weights: originalSettings.risk_weights,
    });
    await service
      .from("payment_method")
      .delete()
      .in("id", [...paymentMethods.values()]);
    if (placeIds.length > 0) {
      await service.from("place").delete().in("id", placeIds);
    }
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  beforeEach(() => {
    paystack.verifyTransaction.mockReset();
    paystack.initializeTransaction.mockReset();
    paystack.initializeTransaction.mockImplementation(
      async (p: { reference: string }) => ({
        reference: p.reference,
        access_code: "test-access",
        authorization_url: "https://checkout.paystack.test/x",
      }),
    );
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

  // ── Loyalty ──────────────────────────────────────────────────────────

  it("gives the service fee back on every 5th order on a different event, after the event", async () => {
    await setRule("loyalty_fee_rebate", true);
    const organizer = await newUser();
    const buyer = await newUser();
    const events = await Promise.all(
      Array.from({ length: 6 }, () => newEvent(organizer.id)),
    );

    // Four different events, a second order for one of them, and a ticket
    // to the buyer's own event: nothing to decide yet.
    const own = await newEvent(buyer.id);
    for (const e of events.slice(0, 4)) await buy(buyer, e);
    const repeat = await buy(buyer, events[0]);
    await buy(buyer, own);
    await runEngine();
    const { data: none } = await service
      .from("reward_event")
      .select("id")
      .eq("rule_key", "loyalty_fee_rebate")
      .eq("beneficiary_user_id", buyer.id);
    expect(none).toEqual([]);
    expect(await reward(repeat.checkoutId, "loyalty_fee_rebate")).toBeNull();
    let progress = await getLoyaltyProgressCore(buyer.id);
    expect(progress.data).toMatchObject({
      ordersRequired: 5,
      ordersCounted: 4,
      windowDays: 90,
      maxPerRewardMinor: 1000,
    });

    // The 5th event: its GH₵ 5 service fee (5% of GH₵ 100) comes back.
    const fifth = await buy(buyer, events[4]);
    await runEngine();
    const r = (await reward(
      fifth.checkoutId,
      "loyalty_fee_rebate",
    )) as RewardEvent;
    expect(r).toMatchObject({
      status: "pending",
      beneficiary_user_id: buyer.id,
      amount_minor: 500,
      is_shadow: false,
    });
    expect(r.basis).toMatchObject({
      orders_counted: 5,
      service_fee_minor: 500,
      cash_fee_minor: 500,
    });
    progress = await getLoyaltyProgressCore(buyer.id);
    expect(progress.data).toMatchObject({
      ordersCounted: 0,
      pendingMinor: 500,
    });

    // A new count starts after the reward.
    const sixth = await buy(buyer, events[5]);
    await runEngine();
    expect(await reward(sixth.checkoutId, "loyalty_fee_rebate")).toBeNull();
    expect((await getLoyaltyProgressCore(buyer.id)).data?.ordersCounted).toBe(
      1,
    );

    // Released after the event (the buyer's phone is verified).
    await endEvent(events[4].eventId);
    await makeDue(r.id);
    await settleDue();
    expect((await reward(fifth.checkoutId, "loyalty_fee_rebate"))?.status).toBe(
      "released",
    );
    expect(await available(buyer.id)).toBe(500);

    const { data: notes } = await service
      .from("notification")
      .select("type")
      .eq("user_id", buyer.id)
      .eq("type", "loyalty_reward");
    expect(notes).toHaveLength(1);
  });

  it("removes a pending loyalty reward when that order is refunded", async () => {
    const organizer = await newUser();
    const buyer = await newUser();
    const events = await Promise.all(
      Array.from({ length: 5 }, () => newEvent(organizer.id)),
    );
    let last = { checkoutId: "", transactionId: "" };
    for (const e of events) last = await buy(buyer, e);
    await runEngine();
    expect((await reward(last.checkoutId, "loyalty_fee_rebate"))?.status).toBe(
      "pending",
    );

    await service
      .from("transaction")
      .update({ status: "refunded" })
      .eq("id", last.transactionId);
    await runEngine();
    expect(await reward(last.checkoutId, "loyalty_fee_rebate")).toMatchObject({
      status: "voided",
      status_reason: "refunded",
    });
    // The refunded order no longer counts; the other four still do.
    expect((await getLoyaltyProgressCore(buyer.id)).data?.ordersCounted).toBe(
      4,
    );
    await setRule("loyalty_fee_rebate", false);
  });

  // ── Promoter commissions ────────────────────────────────────────────

  it("charges the organizer the commission at once and pays the promoter after the event", async () => {
    await setRule("promoter_commission", true);
    const organizer = await newUser();
    const promoter = await newUser();
    const buyer = await newUser();
    const event = await newEvent(organizer.id);

    // Only the organizer can set it, within the live bounds.
    const stranger = await setEventPromoterCommissionCore(
      promoter.client,
      promoter.id,
      { eventId: event.eventId, rateBps: 1000 },
    );
    expect(stranger.status).toBe(403);
    const tooHigh = await setEventPromoterCommissionCore(
      organizer.client,
      organizer.id,
      { eventId: event.eventId, rateBps: 5000 },
    );
    expect(tooHigh.status).toBe(400);
    const set = await setEventPromoterCommissionCore(
      organizer.client,
      organizer.id,
      { eventId: event.eventId, rateBps: 1000 },
    );
    expect(set.status).toBe(200);
    expect(set.data).toMatchObject({ available: true, rateBps: 1000 });

    // Anyone can see the offer; nobody can write it directly.
    const { data: seen } = await buyer.client
      .from("event_promoter_commission")
      .select("rate_bps")
      .eq("event_id", event.eventId)
      .single();
    expect(seen?.rate_bps).toBe(1000);
    const forged = await organizer.client
      .from("event_promoter_commission")
      .update({ rate_bps: 3000 })
      .eq("event_id", event.eventId)
      .select("rate_bps");
    expect(forged.data ?? []).toEqual([]);

    const code = (await getReferralLinkCore(promoter.id)).data?.code as string;
    const sale = await buy(buyer, event, code);
    expect(sale.referrer).toBe(promoter.id);
    await runEngine();

    const r = (await reward(
      sale.checkoutId,
      "promoter_commission",
    )) as RewardEvent;
    // 10% of GH₵ 100.
    expect(r).toMatchObject({
      status: "pending",
      beneficiary_user_id: promoter.id,
      amount_minor: 1000,
      budget_period: null,
    });
    expect(await commissionRows(sale.checkoutId)).toEqual([
      { type: "promoter_commission", amount: -10 },
    ]);
    // The organizer's pending balance is the ticket price minus the commission.
    const { data: overview } = await organizer.client.rpc(
      "get_organizer_finance_overview",
    );
    expect(Number(overview?.[0]?.pending_balance)).toBe(90);

    const stats = await getEventPromoterCommissionCore(
      organizer.client,
      organizer.id,
      event.eventId,
    );
    expect(stats.data?.stats).toMatchObject({
      sales: 1,
      promoters: 1,
      revenueMinor: 10_000,
      pendingMinor: 1000,
      paidMinor: 0,
    });

    // One of the two tickets is cancelled before the event: the promoter
    // gets half, the organizer the other half back.
    const { data: tickets } = await service
      .from("ticket")
      .select("id")
      .eq("ticket_checkout_id", sale.checkoutId)
      .limit(1);
    await service
      .from("ticket")
      .update({ status: "cancelled" })
      .eq("id", tickets?.[0]?.id as string);
    await endEvent(event.eventId);
    await makeDue(r.id);
    await settleDue();
    expect(await reward(sale.checkoutId, "promoter_commission")).toMatchObject({
      status: "released",
      released_minor: 500,
    });
    expect(await available(promoter.id)).toBe(500);
    expect(await commissionRows(sale.checkoutId)).toEqual([
      { type: "promoter_commission", amount: -10 },
      { type: "promoter_commission_reversal", amount: 5 },
    ]);
    // Settled now: the payable balance reflects the net commission.
    const { data: after } = await organizer.client.rpc(
      "get_organizer_finance_overview",
    );
    expect(Number(after?.[0]?.available_balance)).toBe(95);
    const { data: lines } = await organizer.client.rpc(
      "get_organizer_ledger_transactions",
      { p_cursor_created_at: null, p_cursor_id: null, p_limit: 20 } as never,
    );
    expect(
      ((lines ?? []) as { line: string }[]).map((l) => l.line).sort(),
    ).toEqual([
      "promoter_commission",
      "promoter_commission_reversal",
      "ticket_sale",
    ]);
  });

  it("gives the organizer the commission back when the sale is refunded, and charges nothing in shadow mode", async () => {
    const organizer = await newUser();
    const promoter = await newUser();
    const event = await newEvent(organizer.id);
    await setEventPromoterCommissionCore(organizer.client, organizer.id, {
      eventId: event.eventId,
      rateBps: 2000,
    });
    const code = (await getReferralLinkCore(promoter.id)).data?.code as string;

    const refunded = await buy(await newUser(), event, code);
    await runEngine();
    expect(await commissionRows(refunded.checkoutId)).toEqual([
      { type: "promoter_commission", amount: -20 },
    ]);
    await service
      .from("transaction")
      .update({ status: "refunded" })
      .eq("id", refunded.transactionId);
    await runEngine();
    expect(
      await reward(refunded.checkoutId, "promoter_commission"),
    ).toMatchObject({ status: "voided", status_reason: "refunded" });
    expect(await commissionRows(refunded.checkoutId)).toEqual([
      { type: "promoter_commission", amount: -20 },
      { type: "promoter_commission_reversal", amount: 20 },
    ]);

    // A promoter buying through their own second account is rejected.
    const selfBuy = await buy(promoter, event, code);
    expect(selfBuy.referrer).toBeNull();

    await setSettings({ shadow_mode: true });
    const shadow = await buy(await newUser(), event, code);
    await runEngine();
    expect(
      await reward(shadow.checkoutId, "promoter_commission"),
    ).toMatchObject({ is_shadow: true, status: "pending", amount_minor: 2000 });
    expect(await commissionRows(shadow.checkoutId)).toEqual([]);
    await setSettings({ shadow_mode: false });

    // Stopping the offer: later sales earn nothing.
    const stopped = await setEventPromoterCommissionCore(
      organizer.client,
      organizer.id,
      { eventId: event.eventId, rateBps: null },
    );
    expect(stopped.data?.rateBps).toBeNull();
    const later = await buy(await newUser(), event, code);
    await runEngine();
    expect(await reward(later.checkoutId, "promoter_commission")).toBeNull();
    await setRule("promoter_commission", false);
  });

  // ── Place visits ─────────────────────────────────────────────────────

  it("checks a visitor in once a day with the rotating code, only at the place", async () => {
    await setRule("place_visits", true);
    const owner = await newUser();
    const visitor = await newUser();
    const place = await newPlace(owner.id, true);

    const denied = await getPlaceVisitPanelCore(
      visitor.client,
      visitor.id,
      place.id,
    );
    expect(denied.status).toBe(403);
    const panel = await getPlaceVisitPanelCore(
      owner.client,
      owner.id,
      place.id,
    );
    expect(panel.data).toMatchObject({ available: true, verified: true });
    const code = panel.data?.code as string;
    expect(code).toMatch(/^[0-9A-F]{10}$/);
    expect(panel.data?.url).toContain(`/places/${place.slug}?visit=${code}`);

    const at = (lat: number, lng: number, extra = {}) =>
      recordPlaceVisitCore(visitor.id, {
        placeSlug: place.slug,
        code,
        lat,
        lng,
        accuracyM: 20,
        platform: "android",
        ...extra,
      });

    expect((await at(HERE.lat + 0.01, HERE.lng)).data?.outcome).toBe("too_far");
    expect((await at(HERE.lat, HERE.lng, { mocked: true })).data?.outcome).toBe(
      "mocked_location",
    );
    expect(
      (await at(HERE.lat, HERE.lng, { code: "0123456789" })).data?.outcome,
    ).toBe("invalid_code");
    const ok = await at(HERE.lat + 0.0005, HERE.lng);
    expect(ok.status).toBe(200);
    expect(ok.data?.outcome).toBe("recorded");
    expect((await at(HERE.lat, HERE.lng)).data?.outcome).toBe("already_today");
    const ownVisit = await recordPlaceVisitCore(owner.id, {
      placeId: place.id,
      code,
      lat: HERE.lat,
      lng: HERE.lng,
      platform: "web",
    });
    expect(ownVisit.data?.outcome).toBe("own_place");

    // Visitors see only their own visits; nobody writes them directly.
    const { data: mine } = await visitor.client
      .from("place_visit")
      .select("place_id");
    expect(mine).toEqual([{ place_id: place.id }]);
    const { data: others } = await owner.client
      .from("place_visit")
      .select("id");
    expect(others).toEqual([]);
    const forged = await visitor.client.from("place_visit").insert({
      place_id: place.id,
      user_id: visitor.id,
      visited_on: "2026-01-01",
      distance_m: 0,
      platform: "android",
    } as never);
    expect(forged.error).not.toBeNull();
    const direct = await visitor.client.rpc("place_visit_record", {
      p_user_id: visitor.id,
      p_place_id: place.id,
      p_code: code,
      p_lat: HERE.lat,
      p_lng: HERE.lng,
      p_accuracy_m: 5,
      p_platform: "android",
      p_install_id: null,
      p_mocked: false,
    } as never);
    expect(direct.error).not.toBeNull();
    const codeLeak = await visitor.client.rpc("place_visit_code", {
      p_place_id: place.id,
    });
    expect(codeLeak.error).not.toBeNull();
    const secret = await visitor.client.from("place_visit_key").select("*");
    expect(secret.data ?? []).toEqual([]);

    const panelAfter = await getPlaceVisitPanelCore(
      owner.client,
      owner.id,
      place.id,
    );
    expect(panelAfter.data?.stats).toMatchObject({
      today: 1,
      thisMonthVisitors: 1,
    });
  });

  it("pays the owner of a verified place per different verified visitor, once the month is over", async () => {
    const owner = await newUser();
    const place = await newPlace(owner.id, true);
    const unverifiedPlace = await newPlace((await newUser()).id, false);

    const lastMonth = new Date();
    lastMonth.setUTCDate(1);
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    const period = lastMonth.toISOString().slice(0, 10);
    const visitedAt = new Date(`${period}T12:00:00Z`).toISOString();

    const counted = await Promise.all([
      newUser({ ageDays: 60 }),
      newUser({ ageDays: 60 }),
      newUser({ ageDays: 60 }),
    ]);
    const noPhone = await newUser({ phone: false, ageDays: 60 });
    const twin = await newUser({ ageDays: 60 });
    await service.from("device_install").insert([
      {
        install_id: `inst-${owner.id}`,
        user_id: owner.id,
        platform: "android",
      },
      { install_id: `inst-${owner.id}`, user_id: twin.id, platform: "android" },
    ] as never);

    const visit = (placeId: string, userId: string, day: string) => ({
      place_id: placeId,
      user_id: userId,
      visited_on: day,
      distance_m: 10,
      platform: "android",
      created_at: visitedAt,
    });
    const secondDay = `${period.slice(0, 8)}02`;
    const { error } = await service.from("place_visit").insert([
      ...counted.map((u) => visit(place.id, u.id, period)),
      // Visiting again another day doesn't count twice.
      visit(place.id, counted[0].id, secondDay),
      visit(place.id, noPhone.id, period),
      visit(place.id, twin.id, period),
      visit(unverifiedPlace.id, counted[0].id, period),
    ] as never);
    expect(error).toBeNull();

    // Shadow first, then for real.
    await setSettings({ shadow_mode: true });
    await service.rpc("rewards_run_monthly_rebates", {
      p_period_start: period,
    });
    await setSettings({ shadow_mode: false });
    const { data: run } = await service.rpc("rewards_run_monthly_rebates", {
      p_period_start: period,
    });
    expect(run).toMatchObject({ visits_decided: true });

    const { data: decided } = await service
      .from("reward_event")
      .select("*")
      .eq("rule_key", "place_visits")
      .eq("source_id", place.id)
      .order("created_at");
    expect(decided?.map((d) => d.is_shadow)).toEqual([true, false]);
    const live = decided?.[1] as RewardEvent;
    expect(live).toMatchObject({
      status: "released",
      beneficiary_user_id: owner.id,
      released_minor: 150,
    });
    expect(live.basis).toMatchObject({ visitors: 5, counted_visitors: 3 });
    const { data: lot } = await service
      .from("credit_lot")
      .select("kind, spend_scope")
      .eq("id", live.lot_id as string)
      .single();
    expect(lot).toEqual({ kind: "promotion", spend_scope: "promotions" });
    expect(await available(owner.id)).toBe(150);

    const { data: none } = await service
      .from("reward_event")
      .select("id")
      .eq("rule_key", "place_visits")
      .eq("source_id", unverifiedPlace.id);
    expect(none).toEqual([]);

    // Again: nothing new. The current month isn't decided until it's over.
    await service.rpc("rewards_run_monthly_rebates", {
      p_period_start: period,
    });
    expect(await available(owner.id)).toBe(150);
    const thisMonth = `${new Date().toISOString().slice(0, 8)}01`;
    const { data: early } = await service.rpc("rewards_run_monthly_rebates", {
      p_period_start: thisMonth,
    });
    expect(early).toMatchObject({ visits_decided: false, places: 0 });
    await setRule("place_visits", false);
  });

  it("keeps the new figures and functions away from clients", async () => {
    const user = await newUser();
    for (const [fn, args] of [
      ["loyalty_progress", { p_user_id: user.id }],
      ["promoter_commission_event_stats", { p_event_id: user.id }],
      ["place_visit_stats", { p_place_id: user.id }],
    ] as const) {
      const { error } = await user.client.rpc(fn as never, args as never);
      expect(error).not.toBeNull();
    }
    const insert = await user.client.from("event_promoter_commission").insert({
      event_id: (await newEvent(user.id)).eventId,
      rate_bps: 5000,
    });
    expect(insert.error).not.toBeNull();
  });
});
