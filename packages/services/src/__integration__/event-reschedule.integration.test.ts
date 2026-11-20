import type { Database } from "@abonten/types/database.types";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Moving an event that already has tickets (migration 20261120170000,
// docs/architecture/event-reschedule.md), through the real paths: a paid
// order (Paystack's HTTP calls replaced), the move with its notices, a
// holder giving tickets back for the ticket price AND the service fee
// whatever the refund policy says, another keeping them, the window, and
// the limit of two moves.
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
import {
  getEventRescheduleForHolderCore,
  getRescheduleSetupCore,
  keepTicketsAfterRescheduleCore,
  refundAfterRescheduleCore,
  rescheduleEmailBatchCore,
  rescheduleEventCore,
} from "../events/eventRescheduleCore";
import {
  type PostEventCoreInput,
  postEventCore,
} from "../events/postEventCore";
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

const HOUR = 3_600_000;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000);

function baseInput(over: Partial<PostEventCoreInput> = {}): PostEventCoreInput {
  const start = inDays(3);
  return {
    title: `Moving Night ${crypto.randomUUID().slice(0, 6)}`,
    description: "Created by the reschedule suite.",
    category: "Arts & Culture",
    types: ["Theatre"],
    address: "National Theatre, Accra",
    addressDetails: { country_code: "GH", city: "Accra" },
    latitude: 5.5566,
    longitude: -0.1969,
    capacity: 50,
    requireRegistration: false,
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 3 * HOUR).toISOString(),
    multipleTickets: [{ type: "Regular", price: 100, quantity: 20 }],
    flyerPublicId: "test/flyer",
    flyerVersion: "1",
    clientRequestId: crypto.randomUUID(),
    ...over,
  };
}

describe("moving an event", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let guest: TestUser;
  let stranger: TestUser;
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
        p_ticket_expires_at: inDays(4).toISOString(),
        p_tickets: tickets,
      } as unknown as Args<"issue_tickets_for_checkout">);
      return error ? { status: 500, message: error.message } : { status: 200 };
    },
    activatePlacePromotion: async () => ({ status: 500, message: "not used" }),
    activateEventPromotion: async () => ({ status: 500, message: "not used" }),
  };

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, buyer, guest, stranger] = await Promise.all([
      createTestUser(service),
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
    await service.from("payment_method").delete().eq("id", paymentMethodId);
    await service.from("event").delete().eq("organizer_id", organizer.id);
    await Promise.all(
      [organizer, buyer, guest, stranger].map((u) =>
        deleteTestUser(service, u.id),
      ),
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
    paystack.refundTransaction.mockResolvedValue({
      id: 4242,
      status: "pending",
    });
  });

  it("moves the event, tells every holder, and refunds the fee too", async () => {
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
    const { data: regular } = await service
      .from("ticket_type")
      .select("id")
      .eq("event_id", eventId)
      .single();

    // The buyer pays for two: GH₵ 200 + the 5% fee.
    const order = await validateCheckoutCore(buyer.client, buyer.id, {
      eventId,
      quantities: { [regular?.id as string]: 2 },
    });
    expect(order.status, order.message).toBe(200);
    const res = await createMultiCheckoutPaymentAttemptCore(
      buyer.client,
      buyer.id,
      buyer.email,
      {
        checkoutSessionIds: [order.checkoutSessionId as string],
        useCredit: false,
        paymentMethodId,
      },
      (id) => `https://example.test/checkout/${id}`,
      deps,
    );
    expect(res.status, "message" in res ? res.message : "").toBe(200);
    if (res.status !== 200) return;
    paystack.verifyTransaction.mockResolvedValueOnce({
      id: 1,
      status: "success",
      reference: res.data.payment?.reference as string,
      amount: 21_000,
      currency: "GHS",
      gateway_response: "Approved",
      fees: 400,
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      channel: "card",
      customer: { email: buyer.email },
    });
    expect((await finalizePayment(res.data.attempts[0].id, deps)).status).toBe(
      "succeeded",
    );

    // A guest holds a free ticket (no payment).
    await service.from("ticket").insert({
      user_id: guest.id,
      ticket_type_id: regular?.id as string,
      status: "active",
      qr_public_id: "test/qr",
      qr_version: "1",
      expires_at: inDays(4).toISOString(),
      ticket_code: `T-${crypto.randomUUID().slice(0, 10)}`,
    });

    // Strict refund terms: normally nobody could give a ticket back.
    await service
      .from("event")
      .update({ refund_policy: "none" })
      .eq("id", eventId);

    const setup = await getRescheduleSetupCore(
      organizer.client,
      organizer.id,
      eventId,
    );
    expect(setup.status === 200 && setup.data).toMatchObject({
      blocked: null,
      moves: 0,
      maxMoves: 2,
      holders: 2,
    });

    const newStart = inDays(10);
    const newEnd = new Date(newStart.getTime() + 3 * HOUR);
    const move = {
      eventId,
      startsAt: newStart.toISOString(),
      endsAt: newEnd.toISOString(),
      message: "The venue needs repairs. Same seats, new date.",
    };

    // Only the organizer side, with a message, to a real change.
    expect(
      (
        await rescheduleEventCore(
          stranger.client,
          stranger.id,
          stranger.id,
          move,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await rescheduleEventCore(
          organizer.client,
          organizer.id,
          organizer.id,
          {
            ...move,
            message: "  ",
          },
        )
      ).status,
    ).toBe(400);

    const moved = await rescheduleEventCore(
      organizer.client,
      organizer.id,
      organizer.id,
      move,
    );
    expect(moved.status, moved.message).toBe(200);
    if (moved.status !== 200) return;
    expect(moved.data.holders).toBe(2);

    // The event, its tickets' validity, one urgent pushed notice each.
    const { data: event } = await service
      .from("event")
      .select("starts_at, ends_at")
      .eq("id", eventId)
      .single();
    expect(new Date(event?.starts_at as string).getTime()).toBe(
      newStart.getTime(),
    );
    const { data: live } = await service
      .from("ticket")
      .select("expires_at, ticket_type:ticket_type_id!inner(event_id)")
      .eq("ticket_type.event_id", eventId)
      .eq("status", "active");
    expect(
      live?.every((t) => new Date(t.expires_at).getTime() === newEnd.getTime()),
    ).toBe(true);
    const { data: notices } = await service
      .from("notification")
      .select("id, user_id, data")
      .eq("type", "event_rescheduled")
      .eq("data->>eventId", eventId);
    expect(notices?.map((n) => n.user_id).sort()).toEqual(
      [buyer.id, guest.id].sort(),
    );
    expect((notices?.[0].data as { notice?: { id: string } }).notice?.id).toBe(
      "event_rescheduled",
    );
    const { data: pushes } = await service
      .from("notification_delivery")
      .select("urgent, channel")
      .in(
        "notification_id",
        (notices ?? []).map((n) => n.id),
      );
    expect(pushes).toHaveLength(2);
    expect(pushes?.every((p) => p.urgent && p.channel === "push")).toBe(true);
    const batch = await rescheduleEmailBatchCore(moved.data.rescheduleId);
    expect(batch?.userIds.sort()).toEqual([buyer.id, guest.id].sort());

    // The buyer sees the move and what giving back returns: price + fee.
    const view = await getEventRescheduleForHolderCore(
      buyer.client,
      buyer.id,
      eventId,
    );
    expect(view.status).toBe(200);
    if (view.status !== 200 || !view.data) throw new Error("view");
    expect(view.data).toMatchObject({
      refundOpen: true,
      choice: null,
      activeTickets: 2,
      refundBlocked: null,
    });
    expect(view.data.refund).toEqual({
      cashMinor: 21_000,
      creditMinor: 0,
      currency: "GHS",
    });
    // Strangers see nothing.
    expect(
      (
        await getEventRescheduleForHolderCore(
          stranger.client,
          stranger.id,
          eventId,
        )
      ).status === 200,
    ).toBe(true);

    // Giving back, despite "no refunds": price and fee.
    const back = await refundAfterRescheduleCore(
      buyer.client,
      buyer.id,
      eventId,
    );
    expect(back.status, back.message).toBe(200);
    expect(paystack.refundTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      21_000,
    );
    const { data: refunds } = await service
      .from("transaction_refund")
      .select("id, amount, fee_amount")
      .eq("user_id", buyer.id);
    expect(refunds).toHaveLength(1);
    expect(Number(refunds?.[0].amount)).toBe(210);
    expect(Number(refunds?.[0].fee_amount)).toBe(10);
    // The provider confirms: the fee goes back on Abonten's books.
    const { error: outcomeError } = await service.rpc("refund_mark_outcome", {
      p_refund_id: refunds?.[0].id as string,
      p_outcome: "processed",
      p_detail: null,
    });
    expect(outcomeError).toBeNull();
    const { data: audit } = await service
      .from("platform_fee_entry")
      .select(
        "ticket_revenue, service_fee, net_revenue, total_customer_payment",
      )
      .eq("refund_id", refunds?.[0].id as string)
      .single();
    expect({
      ticket: Number(audit?.ticket_revenue),
      fee: Number(audit?.service_fee),
      net: Number(audit?.net_revenue),
      total: Number(audit?.total_customer_payment),
    }).toEqual({ ticket: -200, fee: -10, net: -10, total: -210 });

    // The guest keeps theirs.
    expect(
      (await keepTicketsAfterRescheduleCore(guest.client, guest.id, eventId))
        .status,
    ).toBe(200);
    const kept = await getEventRescheduleForHolderCore(
      guest.client,
      guest.id,
      eventId,
    );
    expect(kept.status === 200 && kept.data?.choice).toBe("keep");

    // Once the window closes, the tickets stay for the new date.
    await service
      .from("event_reschedule")
      .update({ refund_until: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", moved.data.rescheduleId);
    expect(
      (await refundAfterRescheduleCore(guest.client, guest.id, eventId)).status,
    ).toBe(409);

    // Anyone can read that it moved.
    const anon = createClient<Database>(
      process.env.SUPABASE_TEST_URL as string,
      process.env.SUPABASE_TEST_ANON_KEY as string,
      { auth: { persistSession: false } },
    );
    const { data: publicMove } = await anon.rpc("get_event_reschedule", {
      p_event_id: eventId,
    });
    expect(publicMove?.[0]?.moves).toBe(1);

    // Clients cannot move an event themselves.
    const direct = await organizer.client.rpc("event_reschedule", {
      p_event_id: eventId,
      p_actor: organizer.id,
      p_starts_at: inDays(12).toISOString(),
      p_ends_at: inDays(12.1).toISOString(),
      p_message: "sneaky",
    });
    expect(direct.error).not.toBeNull();

    // A second move is fine; a third is refused.
    const second = await rescheduleEventCore(
      organizer.client,
      organizer.id,
      organizer.id,
      {
        ...move,
        startsAt: inDays(12).toISOString(),
        endsAt: new Date(inDays(12).getTime() + 2 * HOUR).toISOString(),
      },
    );
    expect(second.status, second.message).toBe(200);
    const third = await rescheduleEventCore(
      organizer.client,
      organizer.id,
      organizer.id,
      {
        ...move,
        startsAt: inDays(14).toISOString(),
        endsAt: new Date(inDays(14).getTime() + 2 * HOUR).toISOString(),
      },
    );
    expect(third.status).toBe(409);
  });
});
