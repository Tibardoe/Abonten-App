import { createHmac } from "node:crypto";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Live Paystack cutover (2026-09-25). Paystack is an in-memory double; the
// database is real.
//   * a charge Paystack completed that neither the app nor the webhook
//     settled is finished by the reconcile sweep (production held two such
//     test-mode charges from August, still 'initiated');
//   * an abandoned or never-started payment no longer holds its tickets;
//   * a test-mode webhook cannot touch a live account (and the reverse);
//   * keys that mix test and live, or contradict PAYMENTS_MODE, stop
//     payments instead of charging on one account and verifying on another;
//   * every webhook delivery records the reference it was about.
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
import { invalidateMarketCache } from "../markets/marketConfig";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import { paystackProvider } from "../payments/providers/paystackProvider";
import type {
  CheckoutInit,
  VerificationResult,
} from "../payments/providers/types";
import { reconcilePaymentAttemptsCore } from "../payments/reconcilePaymentAttemptsCore";
import { handleProviderWebhook } from "../payments/webhookCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type Args<F extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][F]["Args"];

const TEST_KEY = "sk_test_live_cutover";
const LIVE_KEY = "sk_live_live_cutover";

function fakePaystack() {
  const opened = new Map<string, number>();
  const paid = new Set<string>();
  const pending = new Set<string>();
  vi.spyOn(paystackProvider, "initializeCheckout").mockImplementation(
    async (_account, input): Promise<CheckoutInit> => {
      opened.set(input.reference, input.amount.amountMinor);
      return {
        mode: "popup",
        provider: "paystack",
        reference: input.reference,
        accessCode: `ac_${input.reference}`,
        authorizationUrl: `https://checkout.example/${input.reference}`,
        publicKey: null,
      };
    },
  );
  vi.spyOn(paystackProvider, "verify").mockImplementation(
    async (_account, reference): Promise<VerificationResult> => ({
      status: paid.has(reference)
        ? "success"
        : pending.has(reference)
          ? "pending"
          : "abandoned",
      reference,
      amount: { amountMinor: opened.get(reference) ?? 0, currency: "GHS" },
      providerTransactionId: `tx_${reference}`,
      providerFee: null,
      channel: "card",
      customerEmail: "buyer@example.com",
      instrument: null,
      detail: null,
      raw: {},
    }),
  );
  vi.spyOn(paystackProvider, "refund").mockResolvedValue(undefined);
  return { opened, paid, pending };
}

describe("live Paystack cutover", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  const users: TestUser[] = [];
  const events: string[] = [];
  const envNames: string[] = [];
  const savedEnv: Record<string, string | undefined> = {};

  const deps: PaymentFulfillmentDeps = {
    issueTickets: async (sessionId, transactionId, metadata, auth) => {
      const { data: rows } = await service
        .from("ticket_checkout")
        .select("id, ticket_type_id, quantity, status")
        .eq("checkout_session_id", sessionId)
        .eq("user_id", auth.userId);
      if ((rows ?? []).every((r) => r.status === "paid")) {
        return { status: 200 };
      }
      const tickets = (rows ?? []).flatMap((r) =>
        Array.from({ length: r.quantity }, () => ({
          checkout_id: r.id,
          ticket_type_id: r.ticket_type_id,
          ticket_code: `TKT-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
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
    activatePlacePromotion: async () => ({ status: 500, message: "unused" }),
    activateEventPromotion: async () => ({ status: 500, message: "unused" }),
  };

  function setKeys(secret: string, webhook = secret, mode?: string) {
    process.env[envNames[0]] = secret;
    process.env[envNames[1]] = webhook;
    if (mode) process.env.PAYMENTS_MODE = mode;
    else Reflect.deleteProperty(process.env, "PAYMENTS_MODE");
    invalidateMarketCache();
  }

  beforeAll(async () => {
    service = getServiceClient();
    const { data: acct } = await service
      .from("market_payment_provider")
      .select("secret_key_env, webhook_secret_env")
      .eq("country_code", "GH")
      .eq("provider", "paystack")
      .single();
    envNames.push(
      acct?.secret_key_env as string,
      acct?.webhook_secret_env as string,
    );
    for (const name of [...envNames, "PAYMENTS_MODE"]) {
      savedEnv[name] = process.env[name];
    }
    organizer = await createTestUser(service);
    users.push(organizer);
  });

  beforeEach(async () => {
    setKeys(TEST_KEY);
    buyer = await createTestUser(service);
    users.push(buyer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    invalidateMarketCache();
    for (const id of events) {
      await deleteTestEvent(service, id).catch(() => undefined);
    }
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  async function newEvent(quantity = 5) {
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity,
      price: 50,
    });
    events.push(fixture.eventId);
    return fixture;
  }

  async function openSession(fixture: {
    eventId: string;
    ticketTypeId: string;
  }) {
    const opened = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId: fixture.eventId,
      quantities: { [fixture.ticketTypeId]: 1 },
    });
    expect(opened.status, opened.message).toBe(200);
    return opened.checkoutSessionId as string;
  }

  async function pay(sessionIds: string[]) {
    return createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { checkoutSessionIds: sessionIds, method: "card", platform: "web" },
      (id) => `https://example.test/checkout/${id}`,
      deps,
    );
  }

  async function payOk(sessionIds: string[]) {
    const started = await pay(sessionIds);
    expect(started.status, JSON.stringify(started)).toBe(200);
    if (started.status !== 200) throw new Error("unreachable");
    return started.data;
  }

  /** Moves an attempt (and its checkout's hold) this many minutes back. */
  async function age(attemptId: string, sessionId: string, minutes: number) {
    const at = new Date(Date.now() - minutes * 60_000).toISOString();
    await service
      .from("payment_attempt")
      .update({ created_at: at, updated_at: at })
      .eq("id", attemptId);
    await service
      .from("ticket_checkout")
      .update({
        expires_at: new Date(
          Date.now() - (minutes - 30) * 60_000,
        ).toISOString(),
      })
      .eq("checkout_session_id", sessionId);
  }

  async function stockOf(ticketTypeId: string) {
    const { data } = await service
      .from("ticket_type")
      .select("quantity")
      .eq("id", ticketTypeId)
      .single();
    return data?.quantity as number;
  }

  async function attempt(id: string) {
    const { data } = await service
      .from("payment_attempt")
      .select("status, provider_reference")
      .eq("id", id)
      .single();
    return data;
  }

  function signed(key: string, event: string, data: Record<string, unknown>) {
    const body = JSON.stringify({ event, data });
    return {
      rawBody: body,
      headers: new Headers({
        "x-paystack-signature": createHmac("sha512", key)
          .update(body)
          .digest("hex"),
      }),
    };
  }

  it("before the sweep, a lost charge stays open and holds its tickets; the sweep settles it once", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await payOk([session]);
    const ref = started.payment?.reference as string;
    const id = started.attempts[0].id;
    provider.paid.add(ref);
    await age(id, session, 40);

    // The situation production was in: the checkout is past its hold, but
    // the expiry job will not release it while the attempt is open.
    await service.rpc("expire_stale_ticket_checkouts");
    expect((await attempt(id))?.status).toMatch(/initiated|pending/);
    expect(await stockOf(fixture.ticketTypeId)).toBe(4);

    const first = await reconcilePaymentAttemptsCore(deps);
    expect(first.outcomes.succeeded).toBe(1);
    // A second sweep (or an overlapping one) finds nothing more to do.
    await reconcilePaymentAttemptsCore(deps);
    expect((await attempt(id))?.status).toBe("succeeded");

    const { data: tickets } = await service
      .from("ticket")
      .select("id")
      .eq("user_id", buyer.id);
    const { data: txns } = await service
      .from("transaction")
      .select("amount, currency, provider_reference")
      .eq("user_id", buyer.id);
    expect(tickets).toHaveLength(1);
    expect(txns).toEqual([
      { amount: 52.5, currency: "GHS", provider_reference: ref },
    ]);
  });

  it("an abandoned payment is failed by the sweep and its tickets go back on sale", async () => {
    fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await payOk([session]);
    const id = started.attempts[0].id;
    await age(id, session, 40);
    expect(await stockOf(fixture.ticketTypeId)).toBe(4);

    const run = await reconcilePaymentAttemptsCore(deps);
    expect(run.outcomes.failed).toBe(1);
    expect((await attempt(id))?.status).toBe("failed");
    await service.rpc("expire_stale_ticket_checkouts");
    expect(await stockOf(fixture.ticketTypeId)).toBe(5);
  });

  it("a payment still awaiting approval is left open, not failed", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await payOk([session]);
    const id = started.attempts[0].id;
    provider.pending.add(started.payment?.reference as string);
    await age(id, session, 40);
    const run = await reconcilePaymentAttemptsCore(deps);
    expect(run.outcomes.pending).toBe(1);
    expect((await attempt(id))?.status).toBe("pending");
  });

  it("a buyer still inside the checkout hold is not touched", async () => {
    fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await payOk([session]);
    await age(started.attempts[0].id, session, 20);
    await reconcilePaymentAttemptsCore(deps);
    expect((await attempt(started.attempts[0].id))?.status).toMatch(
      /initiated|pending/,
    );
  });

  it("the sweep and a late webhook settle a charge only once", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await payOk([session]);
    const ref = started.payment?.reference as string;
    provider.paid.add(ref);
    await age(started.attempts[0].id, session, 40);
    const hook = signed(TEST_KEY, "charge.success", {
      reference: ref,
      id: 42,
      domain: "test",
    });
    await Promise.all([
      reconcilePaymentAttemptsCore(deps),
      handleProviderWebhook({
        providerCode: "paystack",
        countryCode: "GH",
        ...hook,
        deps,
      }),
    ]);
    const { data: tickets } = await service
      .from("ticket")
      .select("id")
      .eq("user_id", buyer.id);
    const { data: txns } = await service
      .from("transaction")
      .select("id")
      .eq("user_id", buyer.id);
    expect(tickets).toHaveLength(1);
    expect(txns).toHaveLength(1);
  });

  it("a never-started payment is cancelled after an hour and releases its tickets", async () => {
    fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    const started = await payOk([session]);
    const id = started.attempts[0].id;
    await service
      .from("payment_attempt")
      .update({ provider_reference: null, status: "initiated" })
      .eq("id", id);
    await age(id, session, 70);
    await service.rpc("expire_stale_ticket_checkouts");
    expect(await stockOf(fixture.ticketTypeId)).toBe(4);

    await service.rpc("run_payment_reconcile_dispatch");
    expect((await attempt(id))?.status).toBe("cancelled");
    await service.rpc("expire_stale_ticket_checkouts");
    expect(await stockOf(fixture.ticketTypeId)).toBe(5);
  });

  it("the uncharged members of a charged group are not cancelled", async () => {
    fakePaystack();
    const a = await newEvent();
    const b = await newEvent();
    const started = await payOk([await openSession(a), await openSession(b)]);
    expect(started.attempts).toHaveLength(2);
    for (const m of started.attempts) {
      await service
        .from("payment_attempt")
        .update({
          created_at: new Date(Date.now() - 70 * 60_000).toISOString(),
        })
        .eq("id", m.id);
    }
    await service.rpc("run_payment_reconcile_dispatch");
    for (const m of started.attempts) {
      expect((await attempt(m.id))?.status).not.toBe("cancelled");
    }
  });

  it("a test-mode webhook cannot settle a payment on a live account", async () => {
    const provider = fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    setKeys(LIVE_KEY, TEST_KEY);
    // Webhook secret left at the test key by mistake: the keys disagree,
    // so the account is refused outright (nothing is charged or settled).
    expect((await pay([session])).status).not.toBe(200);
    const leftover = await handleProviderWebhook({
      providerCode: "paystack",
      countryCode: "GH",
      ...signed(TEST_KEY, "charge.success", { reference: "x", domain: "test" }),
      deps,
    });
    expect(leftover.status).not.toBe(200);

    setKeys(LIVE_KEY);
    const started = await payOk([session]);
    const ref = started.payment?.reference as string;
    provider.paid.add(ref);
    // Correctly signed, but a test-mode event: acknowledged, ignored.
    const testEvent = await handleProviderWebhook({
      providerCode: "paystack",
      countryCode: "GH",
      ...signed(LIVE_KEY, "charge.success", {
        reference: ref,
        id: 1,
        domain: "test",
      }),
      deps,
    });
    expect(testEvent).toEqual({
      status: 200,
      body: { received: true, ignored: "mode_mismatch" },
    });
    expect((await attempt(started.attempts[0].id))?.status).toMatch(
      /initiated|pending/,
    );

    const liveEvent = await handleProviderWebhook({
      providerCode: "paystack",
      countryCode: "GH",
      ...signed(LIVE_KEY, "charge.success", {
        reference: ref,
        id: 2,
        domain: "live",
      }),
      deps,
    });
    expect(liveEvent.status).toBe(200);
    expect((await attempt(started.attempts[0].id))?.status).toBe("succeeded");

    const { data: logged } = await service
      .from("payment_webhook_event")
      .select("reference, outcome")
      .eq("provider", "paystack")
      .eq("reference", ref);
    expect(logged).toEqual([{ reference: ref, outcome: "settled" }]);
  });

  it("PAYMENTS_MODE=live refuses test keys; live keys work", async () => {
    fakePaystack();
    const fixture = await newEvent();
    const session = await openSession(fixture);
    setKeys(TEST_KEY, TEST_KEY, "live");
    const refused = await pay([session]);
    expect(refused.status).not.toBe(200);
    expect(JSON.stringify(refused)).not.toContain(TEST_KEY);
    setKeys(LIVE_KEY, LIVE_KEY, "live");
    expect((await pay([session])).status).toBe(200);
  });
});
