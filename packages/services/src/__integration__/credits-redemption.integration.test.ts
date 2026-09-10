import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Paying for promotions with Abonten Credit (migration credit_reservations):
// the reserve / capture / release functions, the sweep, their privileges,
// and the real payment path -- createPromotionPaymentAttemptCore and
// finalizePaystackPayment -- for credit-only and part-credit orders. Only
// the Paystack HTTP call is replaced (vi.mock below); everything else runs
// against real Postgres.
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
import { createPromotionPaymentAttemptCore } from "../payments/createPromotionPaymentAttemptCore";
import { finalizePaystackPayment } from "../payments/finalizePaystackPayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import { insertEventPromotionCheckoutCore } from "../promotions/insertEventPromotionCheckoutCore";
import { getPromotionCreditQuoteCore } from "../rewards/creditRedemptionCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const paystack = vi.hoisted(() => ({
  verifyTransaction: vi.fn(),
}));

vi.mock("../payments/gateway/paystackService", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifyTransaction: paystack.verifyTransaction,
}));

type SettingsRow =
  Database["public"]["Tables"]["reward_program_setting"]["Row"];

const TIER_ID = 1; // seeded: "24 hours", GH₵ 20
const TIER_PRICE_MINOR = 2000;

const key = (label: string) => `test:${label}:${crypto.randomUUID()}`;

async function expectLedgerHealthy(service: SupabaseClient<Database>) {
  const { data, error } = await service.rpc("credit_reconciliation_checks");
  expect(error).toBeNull();
  expect(data).toEqual({
    credit_unbalanced_journals: 0,
    credit_balance_cache_drift: 0,
    credit_lot_bucket_drift: 0,
    credit_lot_invalid_state: 0,
    credit_reservation_stuck: 0,
    credit_capture_mismatch: 0,
  });
}

describe("paying for promotions with credit", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let other: TestUser;
  let eventId: string;
  let originalSettings: SettingsRow;
  const checkoutIds: string[] = [];

  // The service code reaches the database through its own service-role
  // client, configured from these env vars in production.
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

  async function grant(user: TestUser, amount: number, scope = "any") {
    const { error } = await service.rpc("credit_grant", {
      p_user_id: user.id,
      p_amount_minor: amount,
      p_journal_type: "bonus.grant",
      p_lot_kind: scope === "promotions" ? "promotion" : "bonus",
      p_spend_scope: scope,
      p_idempotency_key: key("grant"),
    });
    expect(error).toBeNull();
  }

  async function available(user: TestUser) {
    const { data } = await service
      .from("credit_account")
      .select("available_minor, reserved_minor, lifetime_spent_minor")
      .eq("user_id", user.id)
      .maybeSingle();
    return (
      data ?? { available_minor: 0, reserved_minor: 0, lifetime_spent_minor: 0 }
    );
  }

  async function newCheckout(): Promise<string> {
    const res = await insertEventPromotionCheckoutCore(
      organizer.client,
      organizer.id,
      eventId,
      TIER_ID,
    );
    if (res.status !== 200) throw new Error(res.message);
    checkoutIds.push(res.checkoutId);
    return res.checkoutId;
  }

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, other] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    ({ eventId } = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
    }));
    const { data } = await service
      .from("reward_program_setting")
      .select("*")
      .eq("id", 1)
      .single();
    originalSettings = data as SettingsRow;
    await service
      .from("reward_program_setting")
      .update({
        rewards_enabled: true,
        audience: "all",
        redeem_promotions_enabled: true,
      })
      .eq("id", 1);
  });

  afterAll(async () => {
    await service
      .from("reward_program_setting")
      .update({
        rewards_enabled: originalSettings.rewards_enabled,
        audience: originalSettings.audience,
        redeem_promotions_enabled: originalSettings.redeem_promotions_enabled,
      })
      .eq("id", 1);
    if (checkoutIds.length > 0) {
      await service
        .from("event_promotion")
        .delete()
        .in("promotion_checkout_id", checkoutIds);
      await service
        .from("payment_attempt")
        .delete()
        .in("event_promotion_checkout_id", checkoutIds);
      await service
        .from("event_promotion_checkout")
        .delete()
        .in("id", checkoutIds);
    }
    await Promise.all(
      [organizer, other].map((u) => deleteTestUser(service, u.id)),
    );
  });

  beforeEach(() => {
    paystack.verifyTransaction.mockReset();
  });

  afterEach(async () => {
    await expectLedgerHealthy(service);
  });

  it("keeps every credit function away from clients", async () => {
    const target = crypto.randomUUID();
    const attempts = await Promise.all([
      other.client.rpc("credit_spendable", {
        p_user_id: other.id,
        p_scope: "promotions",
      }),
      other.client.rpc("credit_reserve", {
        p_user_id: other.id,
        p_amount_minor: 100,
        p_order_total_minor: 100,
        p_scope: "promotions",
        p_target_type: "event_promotion_checkout",
        p_target_id: target,
        p_payment_attempt_id: crypto.randomUUID(),
        p_expires_at: new Date(Date.now() + 600_000).toISOString(),
      }),
      other.client.rpc("credit_release_stale_reservations", { p_limit: 1 }),
    ]);
    for (const res of attempts) {
      expect(res.error?.code).toBe("42501");
    }
    const insert = await other.client.from("credit_reservation").insert({
      user_id: other.id,
      scope: "promotions",
      target_type: "event_promotion_checkout",
      target_id: target,
      amount_minor: 100,
      order_total_minor: 100,
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });
    expect(insert.error).not.toBeNull();
  });

  it("quotes, reserves and refuses more than the spendable balance", async () => {
    await grant(other, 1500);
    await grant(other, 700, "tickets"); // not spendable on promotions

    const { data: spendable } = await service.rpc("credit_spendable", {
      p_user_id: other.id,
      p_scope: "promotions",
    });
    expect(spendable).toMatchObject({
      spendable_minor: 1500,
      blocked_reason: null,
    });

    const reserve = (amount: number) =>
      service.rpc("credit_reserve", {
        p_user_id: other.id,
        p_amount_minor: amount,
        p_order_total_minor: 5000,
        p_scope: "promotions",
        p_target_type: "place_promotion_checkout",
        p_target_id: crypto.randomUUID(),
        p_payment_attempt_id: crypto.randomUUID(),
        p_expires_at: new Date(Date.now() + 600_000).toISOString(),
      });

    const tooMuch = await reserve(1600);
    expect(tooMuch.error?.code).toBe("23514");

    const ok = await reserve(1500);
    expect(ok.error).toBeNull();
    const { data: reservation } = await service
      .from("credit_reservation")
      .select("status, amount_minor, cash_minor")
      .eq("id", ok.data as string)
      .single();
    expect(reservation).toEqual({
      status: "reserved",
      amount_minor: 1500,
      cash_minor: 3500,
    });
    expect(await available(other)).toMatchObject({
      available_minor: 700,
      reserved_minor: 1500,
    });

    // The owner can see their reservation; nobody else can.
    const own = await other.client
      .from("credit_reservation")
      .select("id")
      .eq("id", ok.data as string);
    expect(own.data).toHaveLength(1);
    const foreign = await organizer.client
      .from("credit_reservation")
      .select("id")
      .eq("id", ok.data as string);
    expect(foreign.data).toHaveLength(0);

    const released = await service.rpc("credit_release_reservation", {
      p_reservation_id: ok.data as string,
      p_reason: "test",
    });
    expect(released.data).toBe(true);
    expect(await available(other)).toMatchObject({
      available_minor: 2200,
      reserved_minor: 0,
    });
  });

  it("refuses to reserve when spending on promotions is switched off or the account is frozen", async () => {
    await grant(other, 500);
    const reserve = () =>
      service.rpc("credit_reserve", {
        p_user_id: other.id,
        p_amount_minor: 100,
        p_order_total_minor: 100,
        p_scope: "promotions",
        p_target_type: "place_promotion_checkout",
        p_target_id: crypto.randomUUID(),
        p_payment_attempt_id: crypto.randomUUID(),
        p_expires_at: new Date(Date.now() + 600_000).toISOString(),
      });

    await service
      .from("reward_program_setting")
      .update({ redeem_promotions_enabled: false })
      .eq("id", 1);
    expect((await reserve()).error?.code).toBe("55000");
    await service
      .from("reward_program_setting")
      .update({ redeem_promotions_enabled: true })
      .eq("id", 1);

    await service.rpc("credit_set_account_status", {
      p_user_id: other.id,
      p_status: "frozen",
      p_reason: "test",
    });
    expect((await reserve()).error?.code).toBe("55000");
    await service.rpc("credit_set_account_status", {
      p_user_id: other.id,
      p_status: "active",
      p_reason: "test",
    });
    expect((await reserve()).error).toBeNull();
  });

  it("lets only one of two racing checkouts hold the same credit", async () => {
    const racer = await createTestUser(service);
    try {
      await grant(racer, 1000);
      const reserve = () =>
        service.rpc("credit_reserve", {
          p_user_id: racer.id,
          p_amount_minor: 700,
          p_order_total_minor: 700,
          p_scope: "promotions",
          p_target_type: "place_promotion_checkout",
          p_target_id: crypto.randomUUID(),
          p_payment_attempt_id: crypto.randomUUID(),
          p_expires_at: new Date(Date.now() + 600_000).toISOString(),
        });
      const results = await Promise.all([reserve(), reserve(), reserve()]);
      expect(results.filter((r) => !r.error)).toHaveLength(1);
      expect(await available(racer)).toMatchObject({
        available_minor: 300,
        reserved_minor: 700,
      });
    } finally {
      await deleteTestUser(service, racer.id);
    }
  });

  it("pays a promotion entirely with credit, once", async () => {
    await grant(organizer, 500, "promotions");
    await grant(organizer, 3000);
    const checkoutId = await newCheckout();

    const quote = await getPromotionCreditQuoteCore(
      organizer.client,
      organizer.id,
      { kind: "event", checkoutId },
    );
    expect(quote).toMatchObject({
      status: 200,
      data: {
        offered: true,
        orderTotalMinor: TIER_PRICE_MINOR,
        creditMinor: TIER_PRICE_MINOR,
        cashMinor: 0,
        creditOnly: true,
      },
    });

    const before = await available(organizer);
    const res = await createPromotionPaymentAttemptCore(
      organizer.client,
      organizer.id,
      organizer.email,
      { kind: "event", checkoutId, useCredit: true },
      (id) => `test://${id}`,
      deps,
    );
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.data.paystack).toBeNull();
    expect(res.data.verification?.status).toBe(200);
    expect(paystack.verifyTransaction).not.toHaveBeenCalled();

    const after = await available(organizer);
    expect(after.available_minor).toBe(
      before.available_minor - TIER_PRICE_MINOR,
    );
    expect(after.lifetime_spent_minor).toBe(
      before.lifetime_spent_minor + TIER_PRICE_MINOR,
    );

    const { data: attempt } = await service
      .from("payment_attempt")
      .select("status, provider, amount, credit_amount, transaction_id")
      .eq("id", res.data.attempt.id)
      .single();
    expect(attempt).toMatchObject({
      status: "succeeded",
      provider: "abonten_credit",
      amount: 0,
      credit_amount: 20,
    });
    const { data: txn } = await service
      .from("transaction")
      .select("amount, credit_amount, payment_method, reason")
      .eq("id", attempt?.transaction_id as string)
      .single();
    expect(txn).toEqual({
      amount: 0,
      credit_amount: 20,
      payment_method: "abonten_credit",
      reason: "Promotion_Purchase",
    });
    const { count } = await service
      .from("event_promotion")
      .select("id", { count: "exact", head: true })
      .eq("promotion_checkout_id", checkoutId);
    expect(count).toBe(1);

    // The promotion-only credit went first (it can't be used elsewhere).
    const { data: lots } = await service
      .from("credit_lot")
      .select("spend_scope, remaining_minor")
      .eq("user_id", organizer.id)
      .order("created_at");
    expect(
      lots?.find((l) => l.spend_scope === "promotions")?.remaining_minor,
    ).toBe(0);

    // Replaying verification changes nothing.
    const replay = await finalizePaystackPayment(
      organizer.client,
      res.data.attempt.id,
      deps,
    );
    expect(replay.status).toBe("succeeded");
    expect((await available(organizer)).available_minor).toBe(
      after.available_minor,
    );

    const { data: activity } = await organizer.client.rpc(
      "get_my_credit_activity",
      {},
    );
    const used = activity?.find((a) => a.journal_type === "redeem.capture");
    expect(used).toMatchObject({
      amount_minor: -TIER_PRICE_MINOR,
      label: "a feature for Integration Test Event",
    });
  });

  it("refuses a credit-only attempt the user forged themselves", async () => {
    const checkoutId = await newCheckout();
    const { data: forged, error } = await organizer.client
      .from("payment_attempt")
      .insert({
        user_id: organizer.id,
        event_promotion_checkout_id: checkoutId,
        amount: 0,
        currency: "GHS",
        status: "initiated",
        provider: "abonten_credit",
        provider_reference: `ABNCR-${crypto.randomUUID()}`,
      })
      .select("id")
      .single();
    expect(error).toBeNull();

    const result = await finalizePaystackPayment(
      organizer.client,
      forged?.id as string,
      deps,
    );
    expect(result.status).toBe("failed");
    const { count } = await service
      .from("event_promotion")
      .select("id", { count: "exact", head: true })
      .eq("promotion_checkout_id", checkoutId);
    expect(count).toBe(0);
  });

  it("captures part-credit only after Paystack collects exactly the cash part", async () => {
    await grant(organizer, 1200);
    const spend = await service.rpc("credit_spendable", {
      p_user_id: organizer.id,
      p_scope: "promotions",
    });
    const spendable = (spend.data as { spendable_minor: number })
      .spendable_minor;
    // Leave only 1200 spendable so the order is part credit, part cash.
    if (spendable > 1200) {
      await service.rpc("credit_debit_available", {
        p_user_id: organizer.id,
        p_amount_minor: spendable - 1200,
        p_journal_type: "adjust.debit",
        p_idempotency_key: key("trim"),
      });
    }

    const pay = async (paystackAmount: number) => {
      const checkoutId = await newCheckout();
      const reference = `PSK-${crypto.randomUUID()}`;
      const { data: attempt } = await organizer.client
        .from("payment_attempt")
        .insert({
          user_id: organizer.id,
          event_promotion_checkout_id: checkoutId,
          amount: 8,
          credit_amount: 12,
          currency: "GHS",
          status: "pending",
          provider: "paystack",
          provider_reference: reference,
        })
        .select("id")
        .single();
      const reserved = await service.rpc("credit_reserve", {
        p_user_id: organizer.id,
        p_amount_minor: 1200,
        p_order_total_minor: TIER_PRICE_MINOR,
        p_scope: "promotions",
        p_target_type: "event_promotion_checkout",
        p_target_id: checkoutId,
        p_payment_attempt_id: attempt?.id as string,
        p_expires_at: new Date(Date.now() + 600_000).toISOString(),
        p_label: "a feature for Integration Test Event",
      });
      expect(reserved.error).toBeNull();

      paystack.verifyTransaction.mockResolvedValueOnce({
        id: 1,
        status: "success",
        reference,
        amount: paystackAmount,
        currency: "GHS",
        gateway_response: "Approved",
        fees: 20,
        paid_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        channel: "card",
        customer: { email: organizer.email },
      });
      const result = await finalizePaystackPayment(
        organizer.client,
        attempt?.id as string,
        deps,
      );
      return { result, checkoutId, reservationId: reserved.data as string };
    };

    // Paystack reports the full GH₵ 20 instead of the GH₵ 8 cash part:
    // refused, and the credit goes back.
    const mismatch = await pay(TIER_PRICE_MINOR);
    expect(mismatch.result.status).toBe("failed");
    const { data: releasedRow } = await service
      .from("credit_reservation")
      .select("status")
      .eq("id", mismatch.reservationId)
      .single();
    expect(releasedRow?.status).toBe("released");
    expect((await available(organizer)).available_minor).toBe(1200);

    // Exactly the cash part: captured and activated.
    const ok = await pay(800);
    expect(ok.result.status).toBe("succeeded");
    const { data: capturedRow } = await service
      .from("credit_reservation")
      .select("status, transaction_id")
      .eq("id", ok.reservationId)
      .single();
    expect(capturedRow?.status).toBe("captured");
    const { data: txn } = await service
      .from("transaction")
      .select("amount, credit_amount, payment_method")
      .eq("id", capturedRow?.transaction_id as string)
      .single();
    expect(txn).toEqual({
      amount: 8,
      credit_amount: 12,
      payment_method: "paystack+credit",
    });
    expect((await available(organizer)).available_minor).toBe(0);
  });

  it("gives credit back when its payment fails, via the 5-minute sweep", async () => {
    await grant(organizer, 400);
    const reserveFor = async (status: string) => {
      const checkoutId = await newCheckout();
      const { data: attempt } = await organizer.client
        .from("payment_attempt")
        .insert({
          user_id: organizer.id,
          event_promotion_checkout_id: checkoutId,
          amount: 0,
          currency: "GHS",
          status,
          provider: "paystack",
          provider_reference: `PSK-${crypto.randomUUID()}`,
        })
        .select("id")
        .single();
      const reserved = await service.rpc("credit_reserve", {
        p_user_id: organizer.id,
        p_amount_minor: 200,
        p_order_total_minor: TIER_PRICE_MINOR,
        p_scope: "promotions",
        p_target_type: "event_promotion_checkout",
        p_target_id: checkoutId,
        p_payment_attempt_id: attempt?.id as string,
        p_expires_at: new Date(Date.now() + 600_000).toISOString(),
      });
      expect(reserved.error).toBeNull();
      return reserved.data as string;
    };

    const failed = await reserveFor("failed");
    const inFlight = await reserveFor("pending");

    await service.rpc("credit_release_stale_reservations", { p_limit: 100 });

    const { data: rows } = await service
      .from("credit_reservation")
      .select("id, status, release_reason")
      .in("id", [failed, inFlight]);
    expect(rows?.find((r) => r.id === failed)).toMatchObject({
      status: "released",
      release_reason: "payment_failed",
    });
    // A payment still waiting on the customer keeps its credit.
    expect(rows?.find((r) => r.id === inFlight)?.status).toBe("reserved");

    await service.rpc("credit_release_reservation", {
      p_reservation_id: inFlight,
      p_reason: "test",
    });
  });

  it("releases held credit before closing an account", async () => {
    const leaver = await createTestUser(service);
    try {
      await grant(leaver, 400);
      const reserved = await service.rpc("credit_reserve", {
        p_user_id: leaver.id,
        p_amount_minor: 400,
        p_order_total_minor: 400,
        p_scope: "promotions",
        p_target_type: "place_promotion_checkout",
        p_target_id: crypto.randomUUID(),
        p_payment_attempt_id: crypto.randomUUID(),
        p_expires_at: new Date(Date.now() + 600_000).toISOString(),
      });
      expect(reserved.error).toBeNull();

      await service.rpc("credit_close_account", { p_user_id: leaver.id });
      const { data: closed } = await service
        .from("credit_reservation")
        .select("status, release_reason")
        .eq("id", reserved.data as string)
        .single();
      expect(closed).toEqual({
        status: "released",
        release_reason: "account_closed",
      });
      expect(await available(leaver)).toMatchObject({
        available_minor: 0,
        reserved_minor: 0,
      });
    } finally {
      await deleteTestUser(service, leaver.id);
    }
  });
});
