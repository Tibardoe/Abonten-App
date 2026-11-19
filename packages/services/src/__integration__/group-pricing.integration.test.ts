import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Group tickets and group prices (migration 20261119200000,
// docs/architecture/group-tickets-and-prices.md), through the real paths:
// postEventCore, validateCheckoutCore, the payment attempt, finalizePayment
// (Paystack's HTTP calls replaced), issuance and the per-ticket refund
// quote. Every stored count is people; a line is whole purchases.
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { setEventGroupDiscountsCore } from "../events/eventGroupDiscountsCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import { updateEventTicketTypesCore } from "../events/updateEventTicketTypesCore";
import { invalidateFeatureFlagCache } from "../flags/featureFlagCore";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePayment } from "../payments/finalizePayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
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

const FLAG = "tickets.group_pricing";
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(5);
  return {
    title: "Group pricing event",
    description: "Created by the group pricing suite.",
    category: "Arts & Culture",
    types: ["Theatre"],
    address: "National Theatre, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.5566,
    longitude: -0.1969,
    capacity: 10,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
    multipleTickets: [
      { type: "Regular", price: 300, quantity: null },
      { type: "Couple", price: 500, quantity: 3, admits: 2 },
    ],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("group tickets and group prices", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let second: TestUser;
  let paymentMethodId: string;

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
      if ((rows ?? []).every((r) => r.status === "paid")) {
        return { status: 200 };
      }
      // One ticket per person: the row's quantity is people.
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
        p_ticket_expires_at: inDays(6).toISOString(),
        p_tickets: tickets,
      } as unknown as Args<"issue_tickets_for_checkout">);
      return error ? { status: 500, message: error.message } : { status: 200 };
    },
    activatePlacePromotion: async () => ({ status: 500, message: "not used" }),
    activateEventPromotion: async () => ({ status: 500, message: "not used" }),
  };

  async function setFlag(enabled: boolean, subjects: string[] = []) {
    const { error } = await service.from("feature_flag").upsert({
      key: FLAG,
      description: "test",
      enabled,
      rules: { allowSubjects: subjects, percent: 0 },
    });
    expect(error).toBeNull();
    invalidateFeatureFlagCache();
  }

  async function typesOf(eventId: string) {
    const { data } = await service
      .from("ticket_type")
      .select("id, type, price, quantity, admits")
      .eq("event_id", eventId);
    return new Map((data ?? []).map((t) => [t.type as string, t]));
  }

  async function linesOf(sessionId: string) {
    const { data } = await service
      .from("ticket_checkout")
      .select(
        "ticket_type_id, quantity, admits, unit_price, discount, discounted_units, total_price, promo_code, group_discount_percent",
      )
      .eq("checkout_session_id", sessionId);
    return data ?? [];
  }

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, buyer, second] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
      createTestUser(service),
    ]);
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
  });

  afterAll(async () => {
    await setFlag(false, []);
    await service.from("payment_method").delete().eq("id", paymentMethodId);
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await Promise.all(
      [organizer, buyer, second].map((u) => deleteTestUser(service, u.id)),
    );
  });

  beforeEach(() => {
    paystack.verifyTransaction.mockReset();
    paystack.initializeTransaction.mockReset();
    paystack.refundTransaction.mockReset();
    paystack.initializeTransaction.mockImplementation(
      async (_account: unknown, p: { reference: string }) => ({
        reference: p.reference,
        access_code: "test-access",
        authorization_url: "https://checkout.paystack.test/x",
      }),
    );
  });

  it("is off until staff switch it on for the organizer", async () => {
    await setFlag(false, []);
    const refused = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    expect(refused.status).toBe(403);

    // Ordinary tickets need no switch.
    const plain = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({
        multipleTickets: [{ type: "Regular", price: 300, quantity: null }],
      }),
    );
    expect(plain.status, "message" in plain ? plain.message : "").toBe(200);

    // On for someone else only: still refused.
    await setFlag(true, [second.id]);
    const other = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    expect(other.status).toBe(403);
  });

  it("sells a Couple as two tickets at half the price each, counted as two seats", async () => {
    await setFlag(true, [organizer.id]);
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    expect(created.status, "message" in created ? created.message : "").toBe(
      200,
    );
    if (created.status !== 200) return;
    const eventId = created.eventId;
    const types = await typesOf(eventId);
    const couple = types.get("Couple");
    const regular = types.get("Regular");
    // 3 couples on sale = 6 places.
    expect(couple).toMatchObject({ admits: 2, quantity: 6, price: 500 });
    expect(regular).toMatchObject({ admits: 1, quantity: null });

    const opened = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [couple?.id as string]: 2 },
    });
    expect(opened.status, opened.message).toBe(200);
    const sessionId = opened.checkoutSessionId as string;
    expect(await linesOf(sessionId)).toEqual([
      expect.objectContaining({
        quantity: 4,
        admits: 2,
        unit_price: 500,
        discount: 0,
        total_price: 1000,
        group_discount_percent: null,
      }),
    ]);
    expect((await typesOf(eventId)).get("Couple")?.quantity).toBe(2);

    // Two places left = one couple; two couples are refused.
    const tooMany = await validateCheckoutCore(second.client, second.id, {
      eventId,
      quantities: { [couple?.id as string]: 2 },
    });
    expect(tooMany.status).toBe(409);

    // The capacity counts people: 10 - 4 held, so 6 Regular left, not 8.
    const regularTooMany = await validateCheckoutCore(
      second.client,
      second.id,
      { eventId, quantities: { [regular?.id as string]: 7 } },
    );
    expect(regularTooMany.status).toBe(409);

    // Pay: GH₵ 1,000 + the 5% fee.
    const res = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      { checkoutSessionIds: [sessionId], useCredit: false, paymentMethodId },
      (id) => `https://example.test/checkout/${id}`,
      deps,
    );
    expect(res.status, "message" in res ? res.message : "").toBe(200);
    if (res.status !== 200) return;
    const reference = res.data.payment?.reference as string;
    expect(paystack.initializeTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountMinor: 105_000 }),
    );
    paystack.verifyTransaction.mockResolvedValueOnce({
      id: 1,
      status: "success",
      reference,
      amount: 105_000,
      currency: "GHS",
      gateway_response: "Approved",
      fees: 1500,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      channel: "card",
      customer: { email: buyer.email },
    });
    const done = await finalizePayment(res.data.attempts[0].id, deps);
    expect(done.status).toBe("succeeded");

    // Four tickets, four people attending.
    const { data: tickets } = await service
      .from("ticket")
      .select("id, transaction_id")
      .eq("user_id", buyer.id)
      .eq("ticket_type_id", couple?.id as string);
    expect(tickets).toHaveLength(4);
    const { count: attending } = await service
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "attending");
    expect(attending).toBe(4);

    // Each ticket is worth half a couple: refunding one gives back 250.
    const { data: quote, error: quoteError } = await service.rpc(
      "refund_quote_amount",
      {
        p_transaction_id: tickets?.[0].transaction_id as string,
        p_ticket_ids: [tickets?.[0].id as string],
      } as unknown as Args<"refund_quote_amount">,
    );
    expect(quoteError).toBeNull();
    expect(Number(quote)).toBe(250);

    // The organizer's earning is the price they set.
    const { data: earning } = await service
      .from("organizer_ledger_entry")
      .select("amount")
      .eq("event_id", eventId)
      .eq("entry_type", "earning");
    expect(
      (earning ?? []).reduce((sum, row) => sum + Number(row.amount), 0),
    ).toBe(1000);
  });

  it("prices group prices on the whole order and never adds a promo code to them", async () => {
    await setFlag(true, [organizer.id]);
    const created = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({
        capacity: 100,
        multipleTickets: [{ type: "Regular", price: 100, quantity: null }],
        groupDiscounts: [
          { minTickets: 20, percentOff: 15 },
          { minTickets: 10, percentOff: 10 },
        ],
        promoCodes: [
          {
            promoCode: "GROUPBIG",
            discount: 25,
            maximumUse: 4,
            expiryDate: inDays(4).toISOString(),
          },
          {
            promoCode: "GROUPSMALL",
            discount: 10,
            maximumUse: 50,
            expiryDate: inDays(4).toISOString(),
          },
        ],
      }),
    );
    expect(created.status, "message" in created ? created.message : "").toBe(
      200,
    );
    if (created.status !== 200) return;
    const eventId = created.eventId;
    const { data: tiers } = await service
      .from("event_group_discount")
      .select("min_tickets, percent_off")
      .eq("event_id", eventId)
      .order("min_tickets");
    expect(tiers).toEqual([
      { min_tickets: 10, percent_off: 10 },
      { min_tickets: 20, percent_off: 15 },
    ]);
    const regular = (await typesOf(eventId)).get("Regular");

    // 12 tickets reach the 10% tier; the 25% code is better for its 4
    // remaining uses, the other 8 tickets get the group price.
    const better = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [regular?.id as string]: 12 },
      promoCode: "GROUPBIG",
    });
    expect(better.status, better.message).toBe(200);
    expect(await linesOf(better.checkoutSessionId as string)).toEqual([
      expect.objectContaining({
        quantity: 12,
        discounted_units: 4,
        discount: 180,
        total_price: 1020,
        promo_code: "GROUPBIG",
        group_discount_percent: 10,
      }),
    ]);

    // A code no better than the group price is not used (nor spent).
    const worse = await validateCheckoutCore(second.client, second.id, {
      eventId,
      quantities: { [regular?.id as string]: 12 },
      promoCode: "GROUPSMALL",
    });
    expect(worse.status, worse.message).toBe(200);
    expect(await linesOf(worse.checkoutSessionId as string)).toEqual([
      expect.objectContaining({
        discounted_units: 0,
        discount: 120,
        total_price: 1080,
        promo_code: null,
        group_discount_percent: 10,
      }),
    ]);
    const { data: small } = await service
      .from("promo_code")
      .select("times_used")
      .eq("event_id", eventId)
      .eq("promo_code", "GROUPSMALL")
      .single();
    expect(small?.times_used).toBe(0);

    // Group prices stay editable; a smaller group never gets more off.
    const notBetter = await setEventGroupDiscountsCore(
      organizer.client,
      organizer.id,
      {
        eventId,
        tiers: [
          { minTickets: 5, percentOff: 20 },
          { minTickets: 10, percentOff: 10 },
        ],
      },
    );
    expect(notBetter.status).toBe(400);
    const cleared = await setEventGroupDiscountsCore(second.client, second.id, {
      eventId,
      tiers: [],
    });
    expect(cleared.status).toBe(404);
    const removed = await setEventGroupDiscountsCore(
      organizer.client,
      organizer.id,
      { eventId, tiers: [] },
    );
    expect(removed.status).toBe(200);
  });

  it("guards the database: whole purchases, this event's types, server-written group prices", async () => {
    await setFlag(true, [organizer.id]);
    const a = await postEventCore(organizer.client, organizer.id, baseInput());
    const b = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({ clientRequestId: crypto.randomUUID() }),
    );
    if (a.status !== 200 || b.status !== 200) {
      throw new Error("events not created");
    }
    const coupleA = (await typesOf(a.eventId)).get("Couple");
    const coupleB = (await typesOf(b.eventId)).get("Couple");

    const reserve = (eventId: string, typeId: string, quantity: number) =>
      service.rpc("create_ticket_checkout", {
        p_user_id: second.id,
        p_event_id: eventId,
        p_occurrence_id: null,
        p_promo_code_id: null,
        p_promo_code_text: null,
        p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
        p_lines: [
          {
            ticket_type_id: typeId,
            quantity,
            unit_price: 500,
            discount: 0,
            discounted_units: 0,
            amount: 500,
          },
        ],
      } as unknown as Args<"create_ticket_checkout">);

    const half = await reserve(a.eventId, coupleA?.id as string, 3);
    expect(half.error?.message).toMatch(/mismatch/);
    const otherEvent = await reserve(a.eventId, coupleB?.id as string, 2);
    expect(otherEvent.error?.message).toMatch(/not found/);

    // Clients read group prices of published events and write none.
    const write = await organizer.client
      .from("event_group_discount")
      .insert({ event_id: a.eventId, min_tickets: 5, percent_off: 5 });
    expect(write.error).not.toBeNull();
    await service
      .from("event_group_discount")
      .insert({ event_id: a.eventId, min_tickets: 5, percent_off: 5 });
    const { data: visible } = await second.client
      .from("event_group_discount")
      .select("min_tickets")
      .eq("event_id", a.eventId);
    expect(visible).toEqual([{ min_tickets: 5 }]);

    // At most three, even through the service role.
    const four = await service.from("event_group_discount").insert([
      { event_id: b.eventId, min_tickets: 2, percent_off: 2 },
      { event_id: b.eventId, min_tickets: 3, percent_off: 3 },
      { event_id: b.eventId, min_tickets: 4, percent_off: 4 },
      { event_id: b.eventId, min_tickets: 6, percent_off: 6 },
    ]);
    expect(four.error?.message).toMatch(/at most 3/);

    // A free registration admits one person.
    const free = await service.from("ticket_type").insert({
      event_id: b.eventId,
      type: "FREE",
      price: 0,
      currency: "GHS",
      admits: 2,
    });
    expect(free.error).not.toBeNull();

    // Editing ticket types keeps admits and stores places.
    const edited = await updateEventTicketTypesCore(
      organizer.client,
      organizer.id,
      {
        eventId: b.eventId,
        currency: null,
        freeEvent: false,
        singleTicket: null,
        multipleTickets: [
          { type: "Table of 4", price: 1600, quantity: 2, admits: 4 },
        ],
      },
    );
    expect(edited.status, edited.message).toBe(200);
    expect((await typesOf(b.eventId)).get("Table of 4")).toMatchObject({
      admits: 4,
      quantity: 8,
    });
  });
});
