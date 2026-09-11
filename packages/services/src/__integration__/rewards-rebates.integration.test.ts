import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Abonten Rewards Phase 6 -- the monthly organizer / venue rebate run and the
// organizer milestone, through real ticket purchases (validateCheckoutCore /
// createMultiCheckoutPaymentAttemptCore / finalizePaystackPayment with
// Paystack's HTTP calls mocked), then rewards_run_monthly_rebates for the
// month the event settled in.
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
import { getPromotionCreditCore } from "../rewards/promotionCreditCore";
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

const REBATE_RULES = [
  "organizer_rebate",
  "venue_rebate",
  "organizer_milestone",
] as const;

describe("monthly rebates: organizer, venue and milestone", () => {
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

  async function verifyPhone(user: TestUser) {
    const { error } = await service.auth.admin.updateUserById(user.id, {
      phone: `23320${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
      phone_confirm: true,
    });
    expect(error).toBeNull();
  }

  /** opts.ageDays backdates the account (rebates need organizers 30+ days old). */
  async function newUser(
    opts: { phone?: boolean; ageDays?: number } = {},
  ): Promise<TestUser> {
    const user = await createTestUser(service);
    users.push(user);
    if (opts.phone ?? true) await verifyPhone(user);
    if (opts.ageDays) {
      const { error } = await service
        .from("user_info")
        .update({
          created_at: new Date(
            Date.now() - opts.ageDays * 86_400_000,
          ).toISOString(),
        })
        .eq("id", user.id);
      expect(error).toBeNull();
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

  /**
   * Buys 2 × GH₵ 50 (GH₵ 105 with the fee); Paystack reports GH₵ 1.46 in
   * fees. opts.wallet: paid in a way that leaves no card fingerprint.
   */
  async function buy(
    user: TestUser,
    event: { eventId: string; ticketTypeId: string },
    opts: { wallet?: boolean } = {},
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
      authorization: opts.wallet
        ? { channel: "mobile_money" }
        : {
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
    return checkout?.id as string;
  }

  /** Moves an event into the past (ended 4 days ago, so settled 2 days ago). */
  async function endEvent(eventId: string) {
    const startsAt = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const endsAt = new Date(Date.now() - 4 * 86_400_000).toISOString();
    const { error } = await service
      .from("event")
      .update({ starts_at: startsAt, ends_at: endsAt })
      .eq("id", eventId);
    expect(error).toBeNull();
    await service
      .from("event_occurrence")
      .update({ starts_at: startsAt, ends_at: endsAt })
      .eq("event_id", eventId);
  }

  // The month the events above settle in.
  const period = () => {
    const settled = new Date(Date.now() - 2 * 86_400_000);
    return `${settled.getUTCFullYear()}-${String(settled.getUTCMonth() + 1).padStart(2, "0")}-01`;
  };

  async function run() {
    const { data, error } = await service.rpc("rewards_run_monthly_rebates", {
      p_period_start: period(),
    });
    expect(error).toBeNull();
    return data as Record<string, unknown>;
  }

  async function decisions(
    eventId: string,
    ruleKey: (typeof REBATE_RULES)[number],
  ): Promise<RewardEvent[]> {
    const { data } = await service
      .from("reward_event")
      .select("*")
      .eq("event_id", eventId)
      .eq("rule_key", ruleKey)
      .order("created_at");
    return data ?? [];
  }

  async function available(userId: string) {
    const { data } = await service
      .from("credit_account")
      .select("available_minor")
      .eq("user_id", userId)
      .maybeSingle();
    return Number(data?.available_minor ?? 0);
  }

  async function spendable(userId: string, scope: string) {
    const { data } = await service.rpc("credit_spendable", {
      p_user_id: userId,
      p_scope: scope,
    });
    return Number((data as { spendable_minor?: number }).spendable_minor ?? 0);
  }

  /** Abonten's cash net revenue on these checkouts, in pesewas. */
  async function netOf(checkoutIds: string[]) {
    let total = 0;
    for (const id of checkoutIds) {
      const { data: t } = await service
        .from("ticket")
        .select("transaction_id")
        .eq("ticket_checkout_id", id)
        .not("transaction_id", "is", null)
        .limit(1)
        .single();
      const { data: fee } = await service
        .from("platform_fee_entry")
        .select("net_revenue")
        .eq("transaction_id", t?.transaction_id as string)
        .eq("entry_type", "fee")
        .single();
      total += Math.round(Number(fee?.net_revenue) * 100);
    }
    return total;
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
        name: "Rebate Test Venue",
        slug: `rebate-venue-${crypto.randomUUID()}`,
        description: "Created by the rebate integration suite.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra", country: "Ghana" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
        verified,
        claimed: verified,
      } as never)
      .select("id")
      .single();
    expect(error).toBeNull();
    placeIds.push(place?.id as string);
    return place?.id as string;
  }

  const newEvent = (organizerId: string) =>
    createTestEventWithTicketType(service, organizerId, {
      quantity: 40,
      price: 50,
    });

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
      risk_weights: {},
      redeem_promotions_enabled: true,
    });

    const { data: rules } = await service
      .from("reward_rule")
      .select("id, rule_key, version, is_active")
      .in("rule_key", [...REBATE_RULES])
      .order("version");
    for (const key of REBATE_RULES) {
      activeBefore.set(
        key,
        rules?.find((r) => r.rule_key === key && r.is_active)?.id ?? null,
      );
    }
  });

  async function useLaunchRules() {
    const { data: rules } = await service
      .from("reward_rule")
      .select("id, rule_key, version")
      .in("rule_key", ["organizer_rebate", "venue_rebate"])
      .eq("version", 1);
    for (const r of rules ?? []) {
      await service.rpc("reward_rule_set_active", {
        p_rule_key: r.rule_key,
        p_rule_id: r.id,
      });
    }
    // A test version of the milestone that two buyers reach. Versions are
    // immutable and can't be deleted; the test DB keeps it.
    const { data: latest } = await service
      .from("reward_rule")
      .select("version")
      .eq("rule_key", "organizer_milestone")
      .order("version", { ascending: false })
      .limit(1)
      .single();
    const { data: milestone, error } = await service
      .from("reward_rule")
      .insert({
        rule_key: "organizer_milestone",
        version: (latest?.version ?? 1) + 1,
        is_active: false,
        flat_minor: 2000,
        min_basis_minor: 0,
        caps: { unique_paid_attendees: 2, min_account_age_days: 30 },
        release_policy: "monthly",
        lot_kind: "promotion",
        spend_scope: "promotions",
        expiry_days: 180,
        note: "integration test threshold",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    await service.rpc("reward_rule_set_active", {
      p_rule_key: "organizer_milestone",
      p_rule_id: milestone?.id as string,
    });
  }

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
      risk_weights: originalSettings.risk_weights,
      redeem_promotions_enabled: originalSettings.redeem_promotions_enabled,
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

  it("does nothing while no rebate rule is live", async () => {
    for (const key of REBATE_RULES) {
      await service.rpc("reward_rule_set_active", {
        p_rule_key: key,
        p_rule_id: null as unknown as string,
      });
    }
    const result = await run();
    expect(result).toMatchObject({ skipped: "no_live_rules", events: 0 });
    await useLaunchRules();
  });

  it("pays the organizer 20% of the cash net revenue as promotion credit, shadow first, once", async () => {
    const organizer = await newUser({ ageDays: 60 });
    const [buyerA, buyerB] = await Promise.all([newUser(), newUser()]);
    const event = await newEvent(organizer.id);
    const a = await buy(buyerA, event);
    const b = await buy(buyerB, event);
    // Their own tickets never count, however they pay.
    await buy(organizer, event, { wallet: true });
    await endEvent(event.eventId);
    const net = await netOf([a, b]);
    expect(net).toBeGreaterThan(0);

    // Shadow: decided and "released", nothing posted.
    await setSettings({ shadow_mode: true });
    await run();
    let rebate = await decisions(event.eventId, "organizer_rebate");
    expect(rebate).toHaveLength(1);
    expect(rebate[0]).toMatchObject({
      is_shadow: true,
      status: "released",
      beneficiary_user_id: organizer.id,
      amount_minor: Math.floor((net * 2000) / 10000),
    });
    expect(rebate[0].basis).toMatchObject({
      counted_checkouts: 2,
      unique_buyers: 2,
      linked_checkouts_excluded: 1,
      net_cash_minor: net,
    });
    expect(
      (await decisions(event.eventId, "organizer_milestone"))[0],
    ).toMatchObject({
      is_shadow: true,
      status: "released",
      amount_minor: 2000,
    });
    expect(await available(organizer.id)).toBe(0);

    // Live: the same month again, now for real.
    await setSettings({ shadow_mode: false });
    await run();
    rebate = await decisions(event.eventId, "organizer_rebate");
    const live = rebate.find((r) => !r.is_shadow) as RewardEvent;
    expect(live).toMatchObject({
      status: "released",
      released_minor: Math.floor((net * 2000) / 10000),
    });
    const { data: lot } = await service
      .from("credit_lot")
      .select("kind, spend_scope, status, expires_at")
      .eq("id", live.lot_id as string)
      .single();
    expect(lot).toMatchObject({
      kind: "promotion",
      spend_scope: "promotions",
      status: "active",
    });
    const expected = Math.floor((net * 2000) / 10000) + 2000;
    expect(await available(organizer.id)).toBe(expected);
    // Promotion credit pays for featuring, not for tickets.
    expect(await spendable(organizer.id, "promotions")).toBe(expected);
    expect(await spendable(organizer.id, "tickets")).toBe(0);

    const { data: notes } = await service
      .from("notification")
      .select("type")
      .eq("user_id", organizer.id);
    const types = (notes ?? []).map((n) => n.type);
    expect(types.filter((t) => t === "promotion_credit_earned")).toHaveLength(
      1,
    );
    expect(types.filter((t) => t === "milestone_reached")).toHaveLength(1);

    // Running the month again changes nothing.
    await run();
    expect(await decisions(event.eventId, "organizer_rebate")).toHaveLength(2);
    expect(await available(organizer.id)).toBe(expected);

    // The milestone is once per organizer: a second event doesn't pay it.
    const second = await newEvent(organizer.id);
    await buy(buyerA, second);
    await buy(buyerB, second);
    await endEvent(second.eventId);
    await run();
    expect(await decisions(second.eventId, "organizer_milestone")).toEqual([]);
    expect(
      (await decisions(second.eventId, "organizer_rebate")).map(
        (r) => r.status,
      ),
    ).toEqual(["released"]);

    // What the organizer sees.
    const credit = await getPromotionCreditCore(organizer.client, organizer.id);
    expect(credit.data).toMatchObject({
      enabled: true,
      canRedeem: true,
      promotionOnlyMinor: await available(organizer.id),
      spendableMinor: await available(organizer.id),
      pendingMinor: 0,
      earnedMinor: await available(organizer.id),
      last: { periodStart: period() },
      rates: {
        organizerShareBps: 2000,
        venueShareBps: 500,
        milestone: { uniqueBuyers: 2, amountMinor: 2000 },
        expiryDays: 180,
      },
    });
    expect(credit.data?.recent.map((r) => r.kind).sort()).toEqual([
      "milestone",
      "organizer",
      "organizer",
    ]);
  });

  it("refuses young organizer accounts and events with many refunds", async () => {
    const young = await newUser({ ageDays: 5 });
    const buyer = await newUser();
    const youngEvent = await newEvent(young.id);
    await buy(buyer, youngEvent);
    await endEvent(youngEvent.eventId);

    const organizer = await newUser({ ageDays: 60 });
    const refundy = await newEvent(organizer.id);
    const kept = await buy(buyer, refundy);
    const refunded = await buy(await newUser(), refundy);
    await service
      .from("ticket")
      .update({ status: "cancelled" })
      .eq("ticket_checkout_id", refunded);
    await endEvent(refundy.eventId);
    expect(kept).toBeTruthy();

    await run();
    expect(
      (await decisions(youngEvent.eventId, "organizer_rebate"))[0],
    ).toMatchObject({
      status: "rejected",
      status_reason: "account_too_new",
      amount_minor: 0,
    });
    const r = (await decisions(refundy.eventId, "organizer_rebate"))[0];
    expect(r).toMatchObject({
      status: "rejected",
      status_reason: "refund_rate",
    });
    expect(r.basis).toMatchObject({ refund_rate_bps: 5000 });
    expect(await available(young.id)).toBe(0);
  });

  it("pays the owner of a verified venue 5% on other organizers' events, and holds it when they look like the same person", async () => {
    const organizer = await newUser({ ageDays: 60 });
    const venueOwner = await newUser();
    const buyer = await newUser();
    const placeId = await newPlace(venueOwner.id, true);
    const event = await newEvent(organizer.id);
    await service
      .from("event")
      .update({ place_id: placeId })
      .eq("id", event.eventId);
    const checkout = await buy(buyer, event);
    await endEvent(event.eventId);

    // An unverified venue earns nothing.
    const unverifiedOwner = await newUser();
    const other = await newEvent(organizer.id);
    await service
      .from("event")
      .update({ place_id: await newPlace(unverifiedOwner.id, false) })
      .eq("id", other.eventId);
    await buy(buyer, other);
    await endEvent(other.eventId);

    // A venue owner on the organizer's own device is held for review.
    const twin = await newUser();
    await service.from("device_install").insert([
      {
        install_id: `inst-${organizer.id}`,
        user_id: organizer.id,
        platform: "android",
      },
      {
        install_id: `inst-${organizer.id}`,
        user_id: twin.id,
        platform: "android",
      },
    ] as never);
    const twinEvent = await newEvent(organizer.id);
    await service
      .from("event")
      .update({ place_id: await newPlace(twin.id, true) })
      .eq("id", twinEvent.eventId);
    await buy(buyer, twinEvent);
    await endEvent(twinEvent.eventId);

    await run();
    const net = await netOf([checkout]);
    expect((await decisions(event.eventId, "venue_rebate"))[0]).toMatchObject({
      status: "released",
      beneficiary_user_id: venueOwner.id,
      released_minor: Math.floor((net * 500) / 10000),
    });
    expect(await available(venueOwner.id)).toBe(
      Math.floor((net * 500) / 10000),
    );
    expect(await decisions(other.eventId, "venue_rebate")).toEqual([]);
    const held = (await decisions(twinEvent.eventId, "venue_rebate"))[0];
    expect(held).toMatchObject({ status: "held", decision: "review" });
    expect(held.risk_flags).toContain("shared_device");
    expect(await available(twin.id)).toBe(0);
  });

  it("waits for the organizer's phone before releasing", async () => {
    const organizer = await newUser({ ageDays: 60, phone: false });
    const buyer = await newUser();
    const event = await newEvent(organizer.id);
    await buy(buyer, event);
    await endEvent(event.eventId);

    await run();
    const [pending] = await decisions(event.eventId, "organizer_rebate");
    expect(pending).toMatchObject({
      status: "pending",
      status_reason: "phone_not_verified",
    });
    expect(await available(organizer.id)).toBe(0);

    await verifyPhone(organizer);
    await service
      .from("reward_event")
      .update({ next_check_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", pending.id);
    const { error } = await service.rpc("rewards_settle_due", { p_limit: 500 });
    expect(error).toBeNull();
    const [released] = await decisions(event.eventId, "organizer_rebate");
    expect(released.status).toBe("released");
    expect(await available(organizer.id)).toBe(Number(released.released_minor));
  });

  it("keeps the run, the figures and staff-only fields away from clients", async () => {
    const user = await newUser();
    const runAttempt = await user.client.rpc("rewards_run_monthly_rebates", {
      p_period_start: period(),
    });
    expect(runAttempt.error).not.toBeNull();
    const stats = await user.client.rpc("rebate_stats", {
      p_user_id: user.id,
    });
    expect(stats.error).not.toBeNull();
    const runs = await user.client.from("reward_rebate_run").select("id");
    expect(runs.data ?? []).toEqual([]);

    // Owners can't self-verify a place or undo moderation.
    const placeId = await newPlace(user.id, false);
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const verify = await user.client
      .from("place")
      .update({ verified: true } as never)
      .eq("id", placeId);
    expect(verify.error?.message).toMatch(/staff/);
    const insertVerified = await user.client.from("place").insert({
      owner_id: user.id,
      name: "Self-verified",
      slug: `self-verified-${crypto.randomUUID()}`,
      category_id: category?.id,
      location: "POINT(-0.187 5.6037)",
      address: { city: "Accra" },
      status: "published",
      verified: true,
    } as never);
    expect(insertVerified.error?.message).toMatch(/staff/);

    const event = await newEvent(user.id);
    await service
      .from("event")
      .update({ moderation_state: "hidden" })
      .eq("id", event.eventId);
    const unhide = await user.client
      .from("event")
      .update({ moderation_state: "visible" } as never)
      .eq("id", event.eventId);
    expect(unhide.error?.message).toMatch(/staff/);
    const rename = await user.client
      .from("event")
      .update({ title: "Renamed by owner" })
      .eq("id", event.eventId);
    expect(rename.error).toBeNull();

    // Nor make themselves an admin.
    const escalate = await user.client
      .from("user_info")
      .update({ is_admin: true } as never)
      .eq("id", user.id);
    expect(escalate.error).not.toBeNull();
    const { data: me } = await service
      .from("user_info")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    expect(me?.is_admin).toBe(false);
  });
});
