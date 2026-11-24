// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Open-amount tickets (migration 20261123120000,
// docs/architecture/open-amount-tickets.md): the buyer chooses the amount
// within the organizer's range and gets one ticket for it. Through the real
// paths: postEventCore / updateEventTicketTypesCore (the flag and the
// range), validateCheckoutCore and create_ticket_checkout (the amount, one
// ticket, no discounts), the payment attempt and finalizePayment (Paystack's
// HTTP calls replaced; the fee on top), issuance, the per-ticket refund
// quote, the door (checkInTicketCore), the amount on a ticket someone was
// sent (heldTicketPaidAmountsCore) and a run's new show (event_add_show).
import { openAmountPaidOf } from "@abonten/core/openAmountTickets";
import { TICKET_WITH_EVENT_SELECT } from "@abonten/core/ticketSelect";
import type { Database } from "@abonten/types/database.types";
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
import { validateCheckoutCore } from "../checkout/validateCheckoutCore";
import { addEventShowsCore } from "../events/eventShowsCore";
import { getEventForEditCore } from "../events/getEventForEditCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
import { updateEventTicketTypesCore } from "../events/updateEventTicketTypesCore";
import { invalidateFeatureFlagCache } from "../flags/featureFlagCore";
import { createMultiCheckoutPaymentAttemptCore } from "../payments/createMultiCheckoutPaymentAttemptCore";
import { finalizePayment } from "../payments/finalizePayment";
import type { PaymentFulfillmentDeps } from "../payments/fulfillmentDeps";
import { checkInTicketCore } from "../tickets/checkInTicketCore";
import {
  fillHeldTicketPaidAmounts,
  heldTicketPaidAmountsCore,
} from "../tickets/heldTicketPaidAmountsCore";
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

const FLAG = "tickets.open_amount";
const GROUP_FLAG = "tickets.group_pricing";
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

const CREDITS = {
  type: "Ride credits",
  price: 0,
  quantity: null,
  amountMode: "open" as const,
  minAmount: 50,
  maxAmount: 1000,
  amountStep: 10,
  description: "Loaded on your card at the gate",
};

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(5);
  return {
    title: "Open amount park day",
    description: "Created by the open-amount suite.",
    category: "Arts & Culture",
    types: ["Theatre"],
    address: "Shornaa Island, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.5566,
    longitude: -0.1969,
    capacity: 50,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 8 * 3_600_000).toISOString(),
    multipleTickets: [
      { type: "Entry", price: 100, quantity: null },
      { ...CREDITS },
    ],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("open-amount tickets", () => {
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

  async function typesOf(eventId: string) {
    const { data } = await service
      .from("ticket_type")
      .select(
        "id, type, price, quantity, admits, amount_mode, min_amount, max_amount, amount_step, description",
      )
      .eq("event_id", eventId);
    return new Map((data ?? []).map((t) => [t.type as string, t]));
  }

  async function linesOf(sessionId: string) {
    const { data } = await service
      .from("ticket_checkout")
      .select(
        "ticket_type_id, quantity, admits, unit_price, discount, discounted_units, total_price, promo_code, group_discount_percent, open_amount",
      )
      .eq("checkout_session_id", sessionId);
    return data ?? [];
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
    return created.eventId;
  }

  function reserve(
    eventId: string,
    line: Record<string, unknown>,
    userId = second.id,
  ) {
    return service.rpc("create_ticket_checkout", {
      p_user_id: userId,
      p_event_id: eventId,
      p_occurrence_id: null,
      p_promo_code_id: null,
      p_promo_code_text: null,
      p_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      p_lines: [
        {
          quantity: 1,
          discount: 0,
          discounted_units: 0,
          ...line,
        },
      ],
    } as unknown as Args<"create_ticket_checkout">);
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
    await setFlag(FLAG, false, []);
    await setFlag(GROUP_FLAG, false, []);
    await service.from("payment_method").delete().eq("id", paymentMethodId);
    const { data: events } = await service
      .from("event")
      .select("id")
      .eq("organizer_id", organizer.id);
    const ids = (events ?? []).map((e) => e.id);
    if (ids.length > 0) {
      await service
        .from("event_ticket_plan_setting")
        .delete()
        .in("event_id", ids);
    }
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
    await setFlag(FLAG, false, []);
    const refused = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    expect(refused.status).toBe(403);

    // On for someone else only: still refused.
    await setFlag(FLAG, true, [second.id]);
    const other = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput(),
    );
    expect(other.status).toBe(403);

    // Fixed tickets need no switch, and the edit form says it is off.
    const plainId = await createEvent({
      multipleTickets: [{ type: "Entry", price: 100, quantity: null }],
    });
    const edit = await getEventForEditCore(
      organizer.client,
      organizer.id,
      plainId,
    );
    expect(edit.status).toBe(200);
    if (edit.status === 200) {
      expect(edit.data.open_amount_enabled).toBe(false);
      expect(edit.data.ticket_type?.[0]).toMatchObject({
        amount_mode: "fixed",
        min_amount: null,
      });
    }

    // The ticket editor refuses an open type while it is off.
    const edited = await updateEventTicketTypesCore(
      organizer.client,
      organizer.id,
      {
        eventId: plainId,
        currency: null,
        freeEvent: false,
        singleTicket: null,
        multipleTickets: [{ ...CREDITS }],
      },
    );
    expect(edited.status).toBe(403);
  });

  it("refuses a range that cannot be sold, in the service and the database", async () => {
    await setFlag(FLAG, true, [organizer.id]);
    const misaligned = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({
        multipleTickets: [{ ...CREDITS, maxAmount: 995 }],
      }),
    );
    expect(misaligned.status).toBe(400);
    const tooPrecise = await postEventCore(
      organizer.client,
      organizer.id,
      baseInput({ multipleTickets: [{ ...CREDITS, minAmount: 50.005 }] }),
    );
    expect(tooPrecise.status).toBe(400);

    // The database holds the same rules for a row written past the service.
    const eventId = await createEvent({
      multipleTickets: [{ type: "Entry", price: 100, quantity: null }],
    });
    const row = {
      event_id: eventId,
      type: "Bad",
      currency: "GHS",
      amount_mode: "open",
      price: 50,
      min_amount: 50,
      max_amount: 1000,
      amount_step: 10,
    };
    const ok = await service
      .from("ticket_type")
      .insert({ ...row, type: "Good" });
    expect(ok.error).toBeNull();
    for (const bad of [
      { max_amount: 995 },
      { min_amount: 0, price: 0 },
      { price: 60 },
      { admits: 2 },
      { pass_shows: 2 },
      { amount_step: null },
      { min_amount: 50.001, price: 50.001, max_amount: 1000.001 },
    ]) {
      const res = await service.from("ticket_type").insert({ ...row, ...bad });
      expect(res.error, JSON.stringify(bad)).not.toBeNull();
    }
    const fixedWithRange = await service.from("ticket_type").insert({
      event_id: eventId,
      type: "Fixed with range",
      currency: "GHS",
      price: 100,
      min_amount: 50,
    });
    expect(fixedWithRange.error).not.toBeNull();
  });

  it("sells one ticket at the amount chosen, the fee on top, refunded and admitted at that amount", async () => {
    await setFlag(FLAG, true, [organizer.id]);
    const eventId = await createEvent();
    const types = await typesOf(eventId);
    const credits = types.get("Ride credits");
    expect(credits).toMatchObject({
      amount_mode: "open",
      price: 50,
      min_amount: 50,
      max_amount: 1000,
      amount_step: 10,
      admits: 1,
      description: "Loaded on your card at the gate",
    });
    const creditsId = credits?.id as string;

    // Outside the range or off the steps: refused with the buyer's words.
    for (const amount of [40, 1010, 155, "", undefined]) {
      const res = await validateCheckoutCore(second.client, second.id, {
        eventId,
        quantities: { [creditsId]: 1 },
        amounts: amount === undefined ? {} : { [creditsId]: amount },
      });
      expect(res.status, String(amount)).toBe(400);
    }

    // Asked for three: one ticket at the amount chosen.
    const opened = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [creditsId]: 3 },
      amounts: { [creditsId]: 150 },
    });
    expect(opened.status, opened.message).toBe(200);
    const sessionId = opened.checkoutSessionId as string;
    expect(await linesOf(sessionId)).toEqual([
      expect.objectContaining({
        quantity: 1,
        admits: 1,
        unit_price: 150,
        discount: 0,
        discounted_units: 0,
        total_price: 150,
        group_discount_percent: null,
        open_amount: true,
      }),
    ]);

    // Pay: GH₵ 150 + the 5% fee on top.
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
      expect.objectContaining({ amountMinor: 15_750 }),
    );
    paystack.verifyTransaction.mockResolvedValueOnce({
      id: 1,
      status: "success",
      reference,
      amount: 15_750,
      currency: "GHS",
      gateway_response: "Approved",
      fees: 300,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      channel: "card",
      customer: { email: buyer.email },
    });
    const done = await finalizePayment(res.data.attempts[0].id, deps);
    expect(done.status).toBe("succeeded");

    // One ticket, one person.
    const { data: tickets } = await service
      .from("ticket")
      .select("id, transaction_id, status")
      .eq("user_id", buyer.id)
      .eq("ticket_type_id", creditsId);
    expect(tickets).toHaveLength(1);
    const ticket = tickets?.[0];

    // A refund gives back the amount (the fee stays, as for any refund).
    const { data: quote, error: quoteError } = await service.rpc(
      "refund_quote_amount",
      {
        p_transaction_id: ticket?.transaction_id as string,
        p_ticket_ids: [ticket?.id as string],
      } as unknown as Args<"refund_quote_amount">,
    );
    expect(quoteError).toBeNull();
    expect(Number(quote)).toBe(150);

    // The organizer earns the amount paid.
    const { data: earning } = await service
      .from("organizer_ledger_entry")
      .select("amount")
      .eq("event_id", eventId)
      .eq("entry_type", "earning");
    expect(
      (earning ?? []).reduce((sum, row) => sum + Number(row.amount), 0),
    ).toBe(150);

    // The buyer reads the amount from their own checkout line.
    const ticketId = ticket?.id as string;
    const own = await buyer.client
      .from("ticket")
      .select(TICKET_WITH_EVENT_SELECT)
      .eq("id", ticketId)
      .single();
    expect(own.error).toBeNull();
    expect(openAmountPaidOf(own.data as unknown as UserTicketType)).toEqual({
      amount: 150,
      currency: "GHS",
    });

    // Sent to a friend (ticket transfers): the holder's session cannot read
    // the buyer's line, so the service reads the amount for the person who
    // holds the ticket now, and only for them.
    const { data: sent, error: sendError } = await service.rpc(
      "ticket_transfer_send",
      {
        p_ticket_id: ticketId,
        p_from_user_id: buyer.id,
        p_to_user_id: second.id,
        p_to_phone: null,
      } as unknown as Args<"ticket_transfer_send">,
    );
    expect(sendError).toBeNull();
    const transferId = (sent as unknown as { transfer_id: string }[])[0]
      ?.transfer_id;
    const { error: acceptError } = await service.rpc("ticket_transfer_accept", {
      p_transfer_id: transferId,
      p_user_id: second.id,
      p_new_code: `TKT-${crypto.randomUUID().slice(0, 12).toUpperCase()}`,
      p_qr_public_id: "test/qr-sent",
      p_qr_version: "1",
    } as unknown as Args<"ticket_transfer_accept">);
    expect(acceptError).toBeNull();

    const held = await second.client
      .from("ticket")
      .select(TICKET_WITH_EVENT_SELECT)
      .eq("id", ticketId)
      .single();
    expect(held.error).toBeNull();
    const heldTicket = held.data as unknown as UserTicketType;
    expect(heldTicket.checkout ?? null).toBeNull();
    expect(openAmountPaidOf(heldTicket)).toBeNull();

    expect(await heldTicketPaidAmountsCore(second.id, [ticketId])).toEqual({
      status: 200,
      data: { [ticketId]: { amount: 150, currency: "GHS" } },
    });
    const [filled] = await fillHeldTicketPaidAmounts(second.id, [heldTicket]);
    expect(openAmountPaidOf(filled)).toEqual({ amount: 150, currency: "GHS" });
    // The sender no longer holds it; the organizer never did.
    for (const other of [buyer.id, organizer.id]) {
      expect(await heldTicketPaidAmountsCore(other, [ticketId])).toEqual({
        status: 200,
        data: {},
      });
    }
    // A malformed id is refused.
    expect(
      (await heldTicketPaidAmountsCore(second.id, ["not-an-id"])).status,
    ).toBe(400);

    // At the door: the amount paid, the type and its note.
    const scanned = await checkInTicketCore(
      organizer.client,
      organizer.id,
      ticket?.id as string,
      true,
      eventId,
    );
    expect(scanned.status, scanned.message).toBe(200);
    if (scanned.status === 200) {
      expect(scanned.ticket).toEqual({
        type: "Ride credits",
        note: "Loaded on your card at the gate",
        paidAmount: { amount: 150, currency: "GHS" },
      });
    }

    // The range is fixed once sold: not from the organizer's own session.
    const changed = await organizer.client
      .from("ticket_type")
      .update({ max_amount: 2000 })
      .eq("id", creditsId)
      .select("id");
    expect(changed.error?.message ?? "").toMatch(/sold/);
  });

  it("never discounts an open line: no promo code, no group price", async () => {
    await setFlag(FLAG, true, [organizer.id]);
    await setFlag(GROUP_FLAG, true, [organizer.id]);
    const eventId = await createEvent({
      groupDiscounts: [{ minTickets: 2, percentOff: 20 }],
      promoCodes: [
        {
          promoCode: "OPENHALF",
          discount: 50,
          maximumUse: 10,
          expiryDate: inDays(4).toISOString(),
        },
      ],
    });
    const types = await typesOf(eventId);
    const creditsId = types.get("Ride credits")?.id as string;
    const entryId = types.get("Entry")?.id as string;

    // Credits only, with a code: the code is not used (nor spent).
    const alone = await validateCheckoutCore(second.client, second.id, {
      eventId,
      quantities: { [creditsId]: 1 },
      amounts: { [creditsId]: 200 },
      promoCode: "OPENHALF",
    });
    expect(alone.status, alone.message).toBe(200);
    expect(await linesOf(alone.checkoutSessionId as string)).toEqual([
      expect.objectContaining({
        total_price: 200,
        discount: 0,
        promo_code: null,
        open_amount: true,
      }),
    ]);
    const { data: unused } = await service
      .from("promo_code")
      .select("times_used")
      .eq("event_id", eventId)
      .eq("promo_code", "OPENHALF")
      .single();
    expect(unused?.times_used).toBe(0);

    // With one entry: the credits don't count towards the group of 2, and
    // the code discounts the entry only.
    const mixed = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [creditsId]: 1, [entryId]: 1 },
      amounts: { [creditsId]: 300 },
      promoCode: "OPENHALF",
    });
    expect(mixed.status, mixed.message).toBe(200);
    const lines = await linesOf(mixed.checkoutSessionId as string);
    expect(lines.find((l) => l.ticket_type_id === creditsId)).toMatchObject({
      total_price: 300,
      discount: 0,
      group_discount_percent: null,
      promo_code: null,
    });
    expect(lines.find((l) => l.ticket_type_id === entryId)).toMatchObject({
      total_price: 50,
      discount: 50,
      discounted_units: 1,
      promo_code: "OPENHALF",
      group_discount_percent: null,
    });
  });

  it("guards the database: the amount, one ticket, no discount, no plan", async () => {
    await setFlag(FLAG, true, [organizer.id]);
    const eventId = await createEvent();
    const types = await typesOf(eventId);
    const creditsId = types.get("Ride credits")?.id as string;
    const entryId = types.get("Entry")?.id as string;

    const outside = await reserve(eventId, {
      ticket_type_id: creditsId,
      unit_price: 1010,
      amount: 1010,
    });
    expect(outside.error?.message).toMatch(/Choose an amount from/);
    const offStep = await reserve(eventId, {
      ticket_type_id: creditsId,
      unit_price: 155,
      amount: 155,
    });
    expect(offStep.error?.message).toMatch(/in steps of/);
    const two = await reserve(eventId, {
      ticket_type_id: creditsId,
      quantity: 2,
      unit_price: 150,
      amount: 300,
    });
    expect(two.error?.message).toMatch(/mismatch/);
    const discounted = await reserve(eventId, {
      ticket_type_id: creditsId,
      unit_price: 150,
      discount: 15,
      discounted_units: 1,
      amount: 135,
    });
    expect(discounted.error?.message).toMatch(/mismatch/);
    // A fixed line still has to carry the type's price.
    const cheapEntry = await reserve(eventId, {
      ticket_type_id: entryId,
      unit_price: 1,
      amount: 1,
    });
    expect(cheapEntry.error?.message).toMatch(/price has changed/);

    const good = await reserve(eventId, {
      ticket_type_id: creditsId,
      unit_price: 1000,
      amount: 1000,
    });
    expect(good.error).toBeNull();
    expect(await linesOf(good.data as unknown as string)).toEqual([
      expect.objectContaining({
        quantity: 1,
        total_price: 1000,
        open_amount: true,
      }),
    ]);

    // Pay small small never takes an amount the buyer chooses.
    await service
      .from("event_ticket_plan_setting")
      .insert({ event_id: eventId, enabled: true });
    const plan = await service.rpc("ticket_plan_create", {
      p_user_id: buyer.id,
      p_event_id: eventId,
      p_occurrence_id: null,
      p_lines: [
        {
          ticket_type_id: creditsId,
          quantity: 1,
          unit_price: 150,
          discount: 0,
          discounted_units: 0,
          amount: 150,
        },
      ],
      p_currency: "GHS",
      p_country_code: "GH",
      p_ticket_minor: 15_000,
      p_fee_minor: 750,
      p_tax_minor: 0,
      p_fee_bps: 500,
      p_first_part_min_minor: 3_150,
      p_part_min_minor: 1_575,
      p_keep_fee_on_refund: true,
      p_hold_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      p_deadline_at: inDays(3).toISOString(),
      p_event_starts_at: inDays(5).toISOString(),
    } as unknown as Args<"ticket_plan_create">);
    expect(plan.error?.message).toMatch(/open amount/);
  });

  it("keeps the range on a run's new show and in the ticket editor", async () => {
    await setFlag(FLAG, true, [organizer.id]);
    const eventId = await createEvent();
    const show = inDays(9);
    const added = await addEventShowsCore(organizer.client, organizer.id, {
      eventId,
      shows: [
        {
          startsAt: show.toISOString(),
          endsAt: new Date(show.getTime() + 8 * 3_600_000).toISOString(),
        },
      ],
      clientRequestId: crypto.randomUUID(),
    });
    expect(added.status, "message" in added ? added.message : "").toBe(200);
    if (added.status !== 200) return;
    const copy = await typesOf(added.data.shows[0].id);
    expect(copy.get("Ride credits")).toMatchObject({
      amount_mode: "open",
      price: 50,
      min_amount: 50,
      max_amount: 1000,
      amount_step: 10,
    });
    expect(copy.get("Entry")).toMatchObject({
      amount_mode: "fixed",
      min_amount: null,
    });

    // The editor stores an open type at its minimum, admitting one.
    const edited = await updateEventTicketTypesCore(
      organizer.client,
      organizer.id,
      {
        eventId,
        currency: null,
        freeEvent: false,
        singleTicket: null,
        multipleTickets: [
          {
            type: "Deposit",
            price: 999,
            quantity: 5,
            admits: 3,
            amountMode: "open",
            minAmount: 200,
            maxAmount: 2000,
            amountStep: 100,
          },
        ],
      },
    );
    expect(edited.status, edited.message).toBe(200);
    expect((await typesOf(eventId)).get("Deposit")).toMatchObject({
      price: 200,
      admits: 1,
      quantity: 5,
      amount_mode: "open",
      max_amount: 2000,
    });
    const edit = await getEventForEditCore(
      organizer.client,
      organizer.id,
      eventId,
    );
    if (edit.status !== 200) throw new Error("edit read failed");
    expect(edit.data.open_amount_enabled).toBe(true);
    expect(edit.data.ticket_type?.[0]).toMatchObject({
      amount_mode: "open",
      min_amount: 200,
      max_amount: 2000,
      amount_step: 100,
    });
  });
});
