// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Gate partner connectors (migration 20261125120000_gate_partner_connectors,
// docs/architecture/gate-partner-connectors.md): an event whose gate is run
// by the organizer's own check-in system (Hapniin). Through the real paths:
// staff link the event (linkGatePartnerEventAdminCore, against a stand-in
// for Hapniin built from its OpenAPI file — Hapniin itself is never
// called), a buyer pays (validateCheckoutCore → payment attempt →
// finalizePayment → issue_tickets_for_checkout, Paystack's HTTP calls
// replaced), the payment trigger queues the push, the sender registers the
// sale and stores the partner's codes, and the ticket then shows the
// partner's code. Plus: retries after a failure, refunds marked "to void"
// with the organizer told, transfers / comps / promo codes / edits refused,
// links refused for what Hapniin cannot express, the door, the webhook.

import { createHmac } from "node:crypto";
import { gatePushIdempotencyKey } from "@abonten/core/gatePartners/gateLinkRules";
import { ticketEntryCode } from "@abonten/core/gatePartners/ticketEntryCode";
import { TICKET_WITH_EVENT_SELECT } from "@abonten/core/ticketSelect";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { UserTicketType } from "@abonten/types/ticketType";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  endGatePartnerLinkAdminCore,
  linkGatePartnerEventAdminCore,
  retryGatePartnerPushAdminCore,
  setGatePartnerLinkStatusAdminCore,
} from "../admin/gatePartners/gatePartnersAdminCore";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { giveComplimentaryTicketsCore } from "../comps/complimentaryCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import { updateEventTicketTypesCore } from "../events/updateEventTicketTypesCore";
import { invalidateFeatureFlagCache } from "../flags/featureFlagCore";
import {
  type HapniinMock,
  startHapniinMock,
} from "../gatePartners/__fixtures__/hapniinMockServer";
import {
  type GatePushDeps,
  dispatchGatePartnerPushes,
} from "../gatePartners/gatePushCore";
import { notifyGatePartnerVoidsCore } from "../gatePartners/gateVoidCore";
import { handleGatePartnerWebhookCore } from "../gatePartners/gateWebhookCore";
import { createHapniinAdapter } from "../gatePartners/hapniinAdapter";
import {
  confirmGatePartnerVoidsCore,
  getEventGatePartnerCore,
} from "../gatePartners/organizerGateCore";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePayment } from "../payments/finalizePayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import {
  getTicketTransferStateCore,
  sendTicketCore,
} from "../ticketTransfers/ticketTransferCore";
import { resetTicketTransferSettingsCache } from "../ticketTransfers/ticketTransferProgram";
import { checkInTicketCore } from "../tickets/checkInTicketCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

const paystack = vi.hoisted(() => ({
  verifyTransaction: vi.fn(),
  initializeTransaction: vi.fn(),
  refundTransaction: vi.fn(),
}));

vi.mock("../payments/providers/paystackApi", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  verifyTransaction: paystack.verifyTransaction,
  initializeTransaction: paystack.initializeTransaction,
  refundTransaction: paystack.refundTransaction,
}));

type Args<F extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][F]["Args"];

const FLAG = "tickets.gate_partners";
const OPEN_FLAG = "tickets.open_amount";
const KEY_ENV = "HAPNIIN_API_KEY_ITEST";
const SECRET_ENV = "HAPNIIN_WEBHOOK_SECRET_ITEST";
const SECRET = "whsec_integration_only";
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(9);
  return {
    title: "Homecoming gate test",
    description: "Created by the gate partner suite.",
    category: "Arts & Culture",
    types: ["Concert"],
    address: "Independence Square, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.548,
    longitude: -0.192,
    capacity: 200,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 6 * 3_600_000).toISOString(),
    multipleTickets: [
      { type: "Regular", price: 250, quantity: 50 },
      { type: "VIP", price: 750, quantity: 10 },
    ],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("gate partner connectors", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  let organizer: TestUser;
  let buyer: TestUser;
  let friend: TestUser;
  let staff: TestUser;
  let ctx: AdminContext;
  let mock: HapniinMock;
  let paymentMethodId: string;
  const eventIds: string[] = [];
  const voidEmails: { codes: string[]; recipientIds: string[] }[] = [];

  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  const adapterFor = () => createHapniinAdapter({ baseUrl: mock.url });
  const pushDeps: GatePushDeps = {
    adapterFor,
    // No Cloudinary here: a QR id the ticket's check accepts.
    makeQr: async (code, provider) => ({
      publicId: `tickets_qr_codes/gate-${provider}-${code}`,
      version: "1",
    }),
  };

  const fulfil: PaymentFulfillmentDeps = {
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
        p_ticket_expires_at: inDays(10).toISOString(),
        p_tickets: tickets,
      } as unknown as Args<"issue_tickets_for_checkout">);
      return error ? { status: 500, message: error.message } : { status: 200 };
    },
    activatePlacePromotion: async () => ({ status: 500, message: "not used" }),
    activateEventPromotion: async () => ({ status: 500, message: "not used" }),
  };

  async function setFlag(key: string, enabled: boolean, subjects: string[]) {
    const { error } = await service.from("feature_flag").upsert({
      key,
      description: "test",
      enabled,
      rules: { allowSubjects: subjects, percent: 0 },
    });
    expect(error).toBeNull();
    invalidateFeatureFlagCache();
  }

  async function createEvent(over: Partial<PostEventCoreInput> = {}) {
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(over),
    );
    expect(created.status, "message" in created ? created.message : "").toBe(
      200,
    );
    if (created.status !== 200) throw new Error("event not created");
    eventIds.push(created.eventId);
    return created.eventId;
  }

  async function typesOf(eventId: string) {
    const { data } = await service
      .from("ticket_type")
      .select("id, type, price")
      .eq("event_id", eventId);
    return new Map((data ?? []).map((t) => [t.type as string, t.id]));
  }

  /** A linked event: Regular → prod_reg, VIP → prod_vip on evt_gjhf. */
  async function linkedEvent(partnerEventId = "evt_gjhf") {
    const eventId = await createEvent();
    const types = await typesOf(eventId);
    const res = await linkGatePartnerEventAdminCore(
      svc,
      ctx,
      {
        eventId,
        provider: "hapniin",
        partnerEventId,
        apiKeyEnv: KEY_ENV,
        webhookSecretEnv: SECRET_ENV,
        mapping: [
          {
            ticketTypeId: types.get("Regular") as string,
            partnerProductId: "prod_reg",
          },
          {
            ticketTypeId: types.get("VIP") as string,
            partnerProductId: "prod_vip",
          },
        ],
        reason: "Integration test link",
      },
      undefined,
      { adapterFor },
    );
    expect(res.status, res.message).toBe(200);
    return { eventId, types };
  }

  /** Pays for `quantities` (type id → tickets) as `who`; returns the session. */
  async function buy(
    who: TestUser,
    eventId: string,
    quantities: Record<string, number>,
  ) {
    const opened = await validateCheckoutCore(who.client, who.id, {
      eventId,
      quantities,
    });
    expect(opened.status, opened.message).toBe(200);
    const sessionId = opened.checkoutSessionId as string;
    let charged = 0;
    paystack.initializeTransaction.mockImplementationOnce(
      async (_a: unknown, p: { reference: string; amountMinor: number }) => {
        charged = p.amountMinor;
        return {
          reference: p.reference,
          access_code: "test-access",
          authorization_url: "https://checkout.paystack.test/x",
        };
      },
    );
    const res = await createMultiCheckoutPaymentAttemptCore(
      who.client,
      who.id,
      who.email,
      {
        checkoutSessionIds: [sessionId],
        useCredit: false,
        paymentMethodId: who.id === buyer.id ? paymentMethodId : undefined,
      },
      (id) => `https://example.test/checkout/${id}`,
      fulfil,
    );
    expect(res.status, "message" in res ? res.message : "").toBe(200);
    if (res.status !== 200) throw new Error("no attempt");
    const reference = res.data.payment?.reference as string;
    paystack.verifyTransaction.mockResolvedValueOnce({
      id: Math.floor(Math.random() * 1e9),
      status: "success",
      reference,
      amount: charged,
      currency: "GHS",
      gateway_response: "Approved",
      fees: 100,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      channel: "card",
      customer: { email: who.email },
    });
    const done = await finalizePayment(res.data.attempts[0].id, fulfil);
    expect(done.status).toBe("succeeded");
    return sessionId;
  }

  async function pushesOf(sessionId: string) {
    const { data } = await service
      .from("gate_partner_push")
      .select("*")
      .eq("checkout_session_id", sessionId);
    return data ?? [];
  }

  async function ticketsOf(sessionId: string) {
    const { data: lines } = await service
      .from("ticket_checkout")
      .select("id")
      .eq("checkout_session_id", sessionId);
    const { data } = await service
      .from("ticket")
      .select(
        "id, status, user_id, ticket_code, partner_gate, partner_code, partner_qr_public_id, ticket_checkout_id",
      )
      .in(
        "ticket_checkout_id",
        (lines ?? []).map((l) => l.id),
      )
      .order("created_at");
    return data ?? [];
  }

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    [organizer, buyer, friend, staff] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
    await service
      .from("user_info")
      .update({ full_name: "Ama Serwaa Mensah" })
      .eq("id", buyer.id);
    await service
      .from("user_info")
      .update({ full_name: "Kofi" })
      .eq("id", friend.id);
    await service
      .from("user_info")
      .update({ username: `gpf_${friend.id.slice(0, 8)}` })
      .eq("id", friend.id);
    ctx = {
      userId: staff.id,
      email: staff.email,
      roles: ["operations"],
      permissions: ["gatepartners.view", "gatepartners.manage"],
      reauthenticatedAt: Date.now(),
    } as unknown as AdminContext;

    const { data: method, error } = await service
      .from("payment_method")
      .insert({
        user_id: buyer.id,
        method_type: "card",
        details: { brand: "visa", last4: "4081" },
        status: "active",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    paymentMethodId = method?.id as string;

    mock = await startHapniinMock([
      {
        id: "evt_gjhf",
        title: "Ghana-Jamaica Homecoming Festival",
        startDate: inDays(9).toISOString(),
        currency: "GHS",
        products: [
          { id: "prod_reg", name: "Regular", price: 250 },
          { id: "prod_vip", name: "VIP", price: 750 },
        ],
      },
      {
        id: "evt_cheap",
        title: "Another price",
        startDate: inDays(9).toISOString(),
        currency: "GHS",
        products: [
          { id: "prod_reg", name: "Regular", price: 200 },
          { id: "prod_vip", name: "VIP", price: 750 },
        ],
      },
    ]);
    process.env[KEY_ENV] = "pk_sandbox_integration";
    process.env[SECRET_ENV] = SECRET;
    await setFlag(FLAG, true, [organizer.id]);
  });

  afterAll(async () => {
    await setFlag(FLAG, false, []);
    await setFlag(OPEN_FLAG, false, []);
    await service
      .from("ticket_transfer_program_setting")
      .update({ enabled: false, audience: "staff" })
      .eq("id", 1);
    resetTicketTransferSettingsCache();
    await mock?.close();
    if (eventIds.length > 0) {
      await service.from("gate_partner_push").delete().in("event_id", eventIds);
      await service.from("gate_partner_link").delete().in("event_id", eventIds);
      await service
        .from("event_ticket_plan_setting")
        .delete()
        .in("event_id", eventIds);
    }
    await service.from("payment_method").delete().eq("id", paymentMethodId);
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await Promise.all(
      [organizer, buyer, friend, staff].map((u) =>
        deleteTestUser(service, u.id),
      ),
    );
    delete process.env[KEY_ENV];
    delete process.env[SECRET_ENV];
  });

  beforeEach(() => {
    paystack.verifyTransaction.mockReset();
    paystack.initializeTransaction.mockReset();
    paystack.refundTransaction.mockReset();
  });

  it("sells a linked event, registers the sale and shows the partner's code", async () => {
    const { eventId, types } = await linkedEvent();
    const regular = types.get("Regular") as string;

    const sessionId = await buy(buyer, eventId, { [regular]: 2 });

    // The payment queued one push for the line, keyed by the line.
    const [push] = await pushesOf(sessionId);
    expect(push).toMatchObject({
      status: "queued",
      partner_product_id: "prod_reg",
      attempts: 0,
    });
    expect(push.idempotency_key).toBe(gatePushIdempotencyKey(push.checkout_id));

    // Before the partner answers, the ticket says its code is on its way.
    const before = await ticketsOf(sessionId);
    expect(before).toHaveLength(2);
    expect(before.every((t) => t.partner_gate === "hapniin")).toBe(true);
    expect(before.every((t) => t.partner_code === null)).toBe(true);

    const sent = await dispatchGatePartnerPushes({
      sessionId,
      notifyBuyer: false,
      deps: pushDeps,
    });
    expect(sent).toMatchObject({ claimed: 1, done: 1 });

    // One order at the partner, for the right product and quantity, with
    // the line's key and the buyer's names, priced by the partner.
    const posts = mock.requests.filter(
      (r) => r.method === "POST" && r.idempotencyKey === push.idempotency_key,
    );
    expect(posts).toHaveLength(1);
    expect(posts[0].problems).toEqual([]);
    expect(posts[0].body).toMatchObject({
      eventId: "evt_gjhf",
      firstName: "Ama",
      lastName: "Serwaa Mensah",
      email: buyer.email,
      items: [{ productId: "prod_reg", quantity: 2 }],
    });

    const after = await ticketsOf(sessionId);
    const codes = after.map((t) => t.partner_code);
    expect(codes.every((c) => /^TCK-/.test(c ?? ""))).toBe(true);
    expect(new Set(codes).size).toBe(2);
    const [{ data: stored }] = await Promise.all([
      service
        .from("gate_partner_push")
        .select("status, partner_order_id, codes_at")
        .eq("id", push.id)
        .single(),
    ]);
    expect(stored).toMatchObject({ status: "done" });
    expect(stored?.partner_order_id).toMatch(/^ord_/);
    const partnerOrder = mock.orders.get(stored?.partner_order_id as string);
    expect(partnerOrder?.attendees.map((a) => a.ticketCode).sort()).toEqual(
      [...codes].sort(),
    );
    expect(partnerOrder?.totalPrice).toBe(500);

    // The buyer's own ticket (the select every screen, email and PDF use)
    // shows the partner's code and QR, never Abonten's.
    const { data: mine } = await buyer.client
      .from("ticket")
      .select(TICKET_WITH_EVENT_SELECT)
      .eq("id", after[0].id)
      .single();
    const entry = ticketEntryCode(mine as unknown as UserTicketType);
    expect(entry).toMatchObject({
      kind: "partner",
      provider: "hapniin",
      code: after[0].partner_code,
      qrPublicId: `tickets_qr_codes/gate-hapniin-${after[0].partner_code}`,
    });

    // Nothing more to send: a second run claims nothing.
    const again = await dispatchGatePartnerPushes({ deps: pushDeps });
    expect(again.claimed).toBe(0);

    // The organizer sees the link read-only, with the count.
    const view = await getEventGatePartnerCore(svc, organizer.id, eventId);
    expect(view.status).toBe(200);
    if ("data" in view && view.data.linked) {
      expect(view.data).toMatchObject({
        provider: "hapniin",
        partnerEventId: "evt_gjhf",
        ticketsWithCodes: 2,
        salesWaiting: 0,
      });
    }
    // Someone else's event is not theirs to read.
    expect((await getEventGatePartnerCore(svc, buyer.id, eventId)).status).toBe(
      404,
    );

    // The door: Abonten's scanner says check-in happens in Hapniin, for the
    // partner code and for the ticket itself.
    for (const ref of [after[0].partner_code as string, after[0].id]) {
      const door = await checkInTicketCore(
        organizer.client,
        organizer.id,
        ref,
        true,
        eventId,
      );
      expect(door.status, ref).toBe(409);
      expect(door.message).toMatch(/Hapniin/);
    }
  });

  it("retries a failed push with the same key, and finishes a half-done one", async () => {
    const { eventId, types } = await linkedEvent();
    const vip = types.get("VIP") as string;
    const sessionId = await buy(buyer, eventId, { [vip]: 1 });
    const [push] = await pushesOf(sessionId);

    // The partner is down: the push waits, counted, with the error kept.
    mock.failNext(1, 503, "UPSTREAM");
    const first = await dispatchGatePartnerPushes({
      sessionId,
      deps: pushDeps,
    });
    expect(first).toMatchObject({ claimed: 1, deferred: 1, done: 0 });
    const { data: waiting } = await service
      .from("gate_partner_push")
      .select("status, attempts, last_error_code, next_attempt_at")
      .eq("id", push.id)
      .single();
    expect(waiting).toMatchObject({
      status: "queued",
      attempts: 1,
      last_error_code: "UPSTREAM",
    });
    expect(
      new Date(waiting?.next_attempt_at as string).getTime(),
    ).toBeGreaterThan(Date.now());
    // Not due yet: the job leaves it alone.
    expect(
      (await dispatchGatePartnerPushes({ sessionId, deps: pushDeps })).claimed,
    ).toBe(0);

    // The partner registered the order but its codes are not out yet: the
    // push keeps the order and looks again, never posting a second sale.
    await service
      .from("gate_partner_push")
      .update({ next_attempt_at: new Date().toISOString() })
      .eq("id", push.id);
    mock.withholdCodes(1);
    const second = await dispatchGatePartnerPushes({
      sessionId,
      deps: pushDeps,
    });
    expect(second.deferred).toBe(1);
    const { data: ordered } = await service
      .from("gate_partner_push")
      .select("status, partner_order_id, last_error_code")
      .eq("id", push.id)
      .single();
    expect(ordered).toMatchObject({
      status: "ordered",
      last_error_code: "CODES_PENDING",
    });

    // The partner confirms the order by webhook: it becomes due at once.
    const body = JSON.stringify({
      event: "order.completed",
      timestamp: new Date().toISOString(),
      data: { orderId: ordered?.partner_order_id, totalPrice: 750 },
    });
    const sign = (secret: string) =>
      `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    const headers = (sig: string) => ({
      get: (n: string) =>
        n.toLowerCase() === "x-hapniin-signature" ? sig : null,
    });
    expect(
      (
        await handleGatePartnerWebhookCore(
          "hapniin",
          body,
          headers(sign("forged")),
          { adapterFor },
        )
      ).status,
    ).toBe(401);
    const hook = await handleGatePartnerWebhookCore(
      "hapniin",
      body,
      headers(sign(SECRET)),
      { adapterFor },
    );
    expect(hook).toEqual({ status: 200, pushDue: true });

    const third = await dispatchGatePartnerPushes({
      sessionId,
      deps: pushDeps,
    });
    expect(third.done).toBe(1);
    const posts = mock.requests.filter(
      (r) => r.method === "POST" && r.idempotencyKey === push.idempotency_key,
    );
    // The failed POST never reached an order; the next made exactly one.
    expect(posts.length).toBeGreaterThanOrEqual(1);
    expect(
      [...mock.orders.values()].filter(
        (o) => o.id === ordered?.partner_order_id,
      ),
    ).toHaveLength(1);
    const { data: confirmed } = await service
      .from("gate_partner_push")
      .select("status, partner_confirmed_at")
      .eq("id", push.id)
      .single();
    expect(confirmed?.status).toBe("done");
    expect(confirmed?.partner_confirmed_at).not.toBeNull();
    expect((await ticketsOf(sessionId))[0].partner_code).toMatch(/^TCK-/);
  });

  it("stops for staff when the partner refuses, and a retry is a new request", async () => {
    const { eventId, types } = await linkedEvent();
    const regular = types.get("Regular") as string;
    const sessionId = await buy(buyer, eventId, { [regular]: 1 });
    const [push] = await pushesOf(sessionId);

    mock.failNext(1, 400, "SOLD_OUT");
    const res = await dispatchGatePartnerPushes({ sessionId, deps: pushDeps });
    expect(res.failed).toBe(1);
    const { data: failed } = await service
      .from("gate_partner_push")
      .select("status, last_error_code, incident_opened_at, generation")
      .eq("id", push.id)
      .single();
    expect(failed).toMatchObject({
      status: "failed",
      last_error_code: "SOLD_OUT",
      generation: 1,
    });
    expect(failed?.incident_opened_at).not.toBeNull();
    const { data: incident } = await service
      .from("incident")
      .select("status")
      .eq("component", `gate_partners.push.${eventId}`)
      .maybeSingle();
    expect(incident?.status).not.toBe("resolved");

    // Staff retry: a definite refusal gets a new idempotency key.
    const retry = await retryGatePartnerPushAdminCore(svc, ctx, {
      pushId: push.id,
      reason: "Partner added stock",
    });
    expect(retry.status, retry.message).toBe(200);
    const { data: requeued } = await service
      .from("gate_partner_push")
      .select("status, generation, idempotency_key")
      .eq("id", push.id)
      .single();
    expect(requeued).toMatchObject({ status: "queued", generation: 2 });
    expect(requeued?.idempotency_key).toBe(
      gatePushIdempotencyKey(push.checkout_id, 2),
    );
    const done = await dispatchGatePartnerPushes({ sessionId, deps: pushDeps });
    expect(done.done).toBe(1);
    await service
      .from("incident")
      .update({ status: "resolved" })
      .eq("component", `gate_partners.push.${eventId}`);
  });

  it("marks a refunded ticket's code to void and tells the organizer once", async () => {
    const { eventId, types } = await linkedEvent();
    const regular = types.get("Regular") as string;
    const sessionId = await buy(buyer, eventId, { [regular]: 2 });
    await dispatchGatePartnerPushes({ sessionId, deps: pushDeps });
    const tickets = await ticketsOf(sessionId);

    // Any cancel path ends in the same column; the trigger does the rest.
    await service
      .from("ticket")
      .update({ status: "cancelled" })
      .eq("id", tickets[0].id);
    const { data: state } = await service
      .from("gate_partner_ticket")
      .select("state, void_requested_at, organizer_notified_at")
      .eq("ticket_id", tickets[0].id)
      .single();
    expect(state).toMatchObject({
      state: "to_void",
      organizer_notified_at: null,
    });

    voidEmails.length = 0;
    const told = await notifyGatePartnerVoidsCore({
      sendVoidEmail: async (email) => {
        voidEmails.push({
          codes: email.codes,
          recipientIds: email.recipientIds,
        });
      },
    });
    expect(told.codes).toBeGreaterThanOrEqual(1);
    expect(
      voidEmails.some((e) =>
        e.codes.includes(tickets[0].partner_code as string),
      ),
    ).toBe(true);
    expect(
      voidEmails.find((e) =>
        e.codes.includes(tickets[0].partner_code as string),
      )?.recipientIds,
    ).toEqual([organizer.id]);
    const { data: notices } = await service
      .from("notification")
      .select("type, data")
      .eq("user_id", organizer.id)
      .eq("type", "gate_tickets_to_void");
    expect(notices?.length).toBeGreaterThanOrEqual(1);

    // Told once: a second run has nothing for this code.
    voidEmails.length = 0;
    await notifyGatePartnerVoidsCore({
      sendVoidEmail: async (email) => {
        voidEmails.push({
          codes: email.codes,
          recipientIds: email.recipientIds,
        });
      },
    });
    expect(
      voidEmails.some((e) =>
        e.codes.includes(tickets[0].partner_code as string),
      ),
    ).toBe(false);

    // The organizer sees it and records it voided; the other code stays valid.
    const view = await getEventGatePartnerCore(svc, organizer.id, eventId);
    if (!("data" in view) || !view.data.linked) throw new Error("view");
    expect(view.data.toVoid.map((v) => v.code)).toEqual([
      tickets[0].partner_code,
    ]);
    const voided = await confirmGatePartnerVoidsCore(
      svc,
      organizer.id,
      organizer.id,
      {
        eventId,
        ticketIds: [tickets[0].id, tickets[1].id],
      },
    );
    expect(voided).toEqual({ status: 200, data: { voided: 1 } });

    // A line refunded before it was sent is never sent.
    const later = await buy(buyer, eventId, { [regular]: 1 });
    const laterTickets = await ticketsOf(later);
    await service
      .from("ticket")
      .update({ status: "cancelled" })
      .eq("id", laterTickets[0].id);
    const before = mock.requests.length;
    const res = await dispatchGatePartnerPushes({
      sessionId: later,
      deps: pushDeps,
    });
    expect(res.cancelled).toBe(1);
    expect(mock.requests.length).toBe(before);
  });

  it("refuses transfers, gifts, promo codes and ticket edits on a linked event", async () => {
    const { eventId, types } = await linkedEvent();
    const regular = types.get("Regular") as string;
    const sessionId = await buy(buyer, eventId, { [regular]: 1 });
    await dispatchGatePartnerPushes({ sessionId, deps: pushDeps });
    const [ticket] = await ticketsOf(sessionId);

    // Sending to a friend: the code is the partner's.
    await service
      .from("ticket_transfer_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTicketTransferSettingsCache();
    const state = await getTicketTransferStateCore(svc, buyer.id, ticket.id);
    expect(state.status).toBe(200);
    if (state.status === 200) {
      expect(state.data).toMatchObject({
        canSend: false,
        block: "partner_gate",
      });
    }
    const sent = await sendTicketCore(
      svc,
      buyer.id,
      {
        ticketId: ticket.id,
        target: { kind: "username", username: `gpf_${friend.id.slice(0, 8)}` },
      },
      { canTextNumber: async () => false },
    );
    expect(sent.status).toBe(409);
    // And the database refuses the move whatever the caller.
    const moved = await service
      .from("ticket")
      .update({ user_id: friend.id })
      .eq("id", ticket.id);
    expect(moved.error?.message).toMatch(/cannot be sent to someone else/);

    // A complimentary ticket: refused by the service and by the database.
    const gift = await giveComplimentaryTicketsCore(
      organizer.client,
      organizer.id,
      organizer.id,
      {
        eventId,
        ticketTypeId: regular,
        quantity: 1,
        target: { kind: "username", username: `gpf_${friend.id.slice(0, 8)}` },
      },
    );
    expect(gift.status).toBe(409);
    const paidInsert = await service.from("ticket_checkout").insert({
      checkout_session_id: crypto.randomUUID(),
      user_id: friend.id,
      event_id: eventId,
      ticket_type_id: regular,
      quantity: 1,
      unit_price: 0,
      total_price: 0,
      status: "paid",
    });
    expect(paidInsert.error?.message).toMatch(/organizer's gate system/);

    // A promo code would charge less than the partner records.
    const promo = await service
      .from("promo_code")
      .insert({
        event_id: eventId,
        promo_code: "GATE10",
        discount_percentage: 10,
        max_uses: 5,
        expires_at: inDays(3).toISOString(),
        is_active: true,
      })
      .select("id")
      .single();
    expect(promo.error).toBeNull();
    const withCode = await validateCheckoutCore(friend.client, friend.id, {
      eventId,
      quantities: { [regular]: 1 },
      promoCode: "GATE10",
    });
    expect(withCode.status).toBe(409);
    await service
      .from("promo_code")
      .delete()
      .eq("id", promo.data?.id as string);

    // Prices and types stay what the partner sells.
    const edited = await updateEventTicketTypesCore(
      organizer.client,
      organizer.id,
      {
        eventId,
        currency: null,
        freeEvent: false,
        singleTicket: null,
        multipleTickets: [{ type: "Regular", price: 300, quantity: 50 }],
      },
    );
    expect(edited.status).toBe(409);
    const repriced = await service
      .from("ticket_type")
      .update({ price: 300 })
      .eq("id", regular);
    expect(repriced.error?.message).toMatch(
      /linked to the organizer's gate system/,
    );
    const stock = await service
      .from("ticket_type")
      .update({ quantity: 40 })
      .eq("id", regular);
    expect(stock.error).toBeNull();
    const group = await service
      .from("event_group_discount")
      .insert({ event_id: eventId, min_tickets: 4, percent_off: 10 });
    expect(group.error?.message).toMatch(
      /linked to the organizer's gate system/,
    );

    // Paused: no sale; the link cannot end once a sale went through.
    const paused = await setGatePartnerLinkStatusAdminCore(svc, ctx, {
      eventId,
      status: "paused",
      reason: "Checking prices",
    });
    expect(paused.status).toBe(200);
    const blocked = await validateCheckoutCore(friend.client, friend.id, {
      eventId,
      quantities: { [regular]: 1 },
    });
    expect(blocked.status).toBe(409);
    const ended = await endGatePartnerLinkAdminCore(svc, ctx, {
      eventId,
      reason: "Try to end",
    });
    expect(ended.status).toBe(409);
  });

  it("refuses a link the partner cannot express one to one", async () => {
    const link = (
      eventId: string,
      mapping: { ticketTypeId: string; partnerProductId: string }[],
      partnerEventId = "evt_gjhf",
    ) =>
      linkGatePartnerEventAdminCore(
        svc,
        ctx,
        {
          eventId,
          provider: "hapniin",
          partnerEventId,
          apiKeyEnv: KEY_ENV,
          webhookSecretEnv: null,
          mapping,
          reason: "Integration test link",
        },
        undefined,
        { adapterFor },
      );

    // A price that differs from the partner's.
    const plain = await createEvent();
    const plainTypes = await typesOf(plain);
    const mapping = [
      {
        ticketTypeId: plainTypes.get("Regular") as string,
        partnerProductId: "prod_reg",
      },
      {
        ticketTypeId: plainTypes.get("VIP") as string,
        partnerProductId: "prod_vip",
      },
    ];
    const cheap = await link(plain, mapping, "evt_cheap");
    expect(cheap.status).toBe(409);
    expect(cheap.message).toMatch(/costs/);
    // An unknown variable name never reads another secret.
    const badEnv = await linkGatePartnerEventAdminCore(
      svc,
      ctx,
      {
        eventId: plain,
        provider: "hapniin",
        partnerEventId: "evt_gjhf",
        apiKeyEnv: "SUPABASE_SERVICE_ROLE_KEY",
        webhookSecretEnv: null,
        mapping,
        reason: "Integration test link",
      },
      undefined,
      { adapterFor },
    );
    expect(badEnv.status).toBe(409);
    // The flag is per organizer.
    await setFlag(FLAG, true, [buyer.id]);
    expect((await link(plain, mapping)).status).toBe(403);
    await setFlag(FLAG, true, [organizer.id]);

    // An open amount.
    await setFlag(OPEN_FLAG, true, [organizer.id]);
    const open = await createEvent({
      multipleTickets: [
        { type: "Regular", price: 250, quantity: 50 },
        {
          type: "VIP",
          price: 0,
          quantity: null,
          amountMode: "open",
          minAmount: 100,
          maxAmount: 1000,
          amountStep: 10,
        },
      ],
    });
    const openTypes = await typesOf(open);
    const openRes = await link(open, [
      {
        ticketTypeId: openTypes.get("Regular") as string,
        partnerProductId: "prod_reg",
      },
      {
        ticketTypeId: openTypes.get("VIP") as string,
        partnerProductId: "prod_vip",
      },
    ]);
    expect(openRes.status).toBe(409);
    expect(openRes.message).toMatch(/choose the amount/);

    // A seated event (and the database rule says the same).
    const seated = await createEvent();
    const { data: plan } = await service
      .from("seating_plan")
      .insert({ owner_id: organizer.id, name: "Hall" })
      .select("id")
      .single();
    if (plan) {
      await service
        .from("event_seating")
        .insert({ event_id: seated, plan_id: plan.id });
    }
    const { data: problems } = await service.rpc(
      "gate_partner_event_problems",
      {
        p_event_id: seated,
      },
    );
    expect(problems).toContain("seated");
    const seatedTypes = await typesOf(seated);
    const seatedRes = await link(seated, [
      {
        ticketTypeId: seatedTypes.get("Regular") as string,
        partnerProductId: "prod_reg",
      },
      {
        ticketTypeId: seatedTypes.get("VIP") as string,
        partnerProductId: "prod_vip",
      },
    ]);
    expect(seatedRes.status).toBe(409);
    expect(seatedRes.message).toMatch(/assigned seats/);
    await service.from("event_seating").delete().eq("event_id", seated);
    if (plan) await service.from("seating_plan").delete().eq("id", plan.id);

    // After a sale on Abonten, too late to link.
    const sold = await createEvent();
    const soldTypes = await typesOf(sold);
    await buy(buyer, sold, { [soldTypes.get("Regular") as string]: 1 });
    const late = await link(sold, [
      {
        ticketTypeId: soldTypes.get("Regular") as string,
        partnerProductId: "prod_reg",
      },
      {
        ticketTypeId: soldTypes.get("VIP") as string,
        partnerProductId: "prod_vip",
      },
    ]);
    expect(late.status).toBe(409);
    expect(late.message).toMatch(/already reserved or sold/);

    // Before any sale a link can end, and the event sells Abonten tickets.
    const fresh = await linkedEvent();
    const endRes = await endGatePartnerLinkAdminCore(svc, ctx, {
      eventId: fresh.eventId,
      reason: "Changed our mind",
    });
    expect(endRes.status).toBe(200);
  });
});
