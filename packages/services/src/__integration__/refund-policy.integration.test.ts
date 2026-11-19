import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// An event's refund policy (migration 20261119120000, PROJECT.md §77):
//   1. once people hold tickets, the organizer's session can only make the
//      policy more generous (guard_event_refund_policy);
//   2. a buyer can't cancel a ticket once its show has started, and a paid
//      one only as the policy allows — refused on the server, whatever the
//      app shows (cancelUserTicketCore → buyerCancelGate).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cancelUserTicketCore } from "../tickets/cancelUserTicketCore";
import {
  type TestUser,
  createSessionClient,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("event refund policy", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let organizerSession: SupabaseClient<Database>;
  let eventId: string;
  let ticketTypeId: string;
  const buyers: TestUser[] = [];
  const transactionIds: string[] = [];

  beforeAll(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    organizerSession = await createSessionClient(organizer);
    ({ eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 50, price: 100 },
    ));
  });

  afterAll(async () => {
    await service.from("ticket").delete().eq("ticket_type_id", ticketTypeId);
    if (transactionIds.length > 0) {
      await service.from("transaction").delete().in("id", transactionIds);
    }
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await Promise.all(
      [organizer, ...buyers].map((u) => deleteTestUser(service, u.id)),
    );
  });

  async function setPolicy(
    client: SupabaseClient<Database>,
    policy: string,
    cutoffHours: number | null = null,
  ) {
    return client
      .from("event")
      .update({ refund_policy: policy, refund_cutoff_hours: cutoffHours })
      .eq("id", eventId);
  }

  async function issueTicket(paid: boolean) {
    const buyer = await createTestUser(service);
    buyers.push(buyer);
    let transactionId: string | null = null;
    if (paid) {
      const { data, error } = await service
        .from("transaction")
        .insert({
          user_id: buyer.id,
          full_name: "Buyer",
          email: buyer.email,
          reason: "Ticket_Purchase",
          amount: 105,
          currency: "GHS",
          status: "successful",
          payment_method: "paystack",
          provider: "paystack",
          provider_reference: `RFP-${crypto.randomUUID()}`,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      transactionId = data.id;
      transactionIds.push(data.id);
    }
    const { data, error } = await service
      .from("ticket")
      .insert({
        user_id: buyer.id,
        ticket_type_id: ticketTypeId,
        status: "active",
        ticket_code: `TKT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        qr_public_id: "test/qr",
        qr_version: "1",
        transaction_id: transactionId,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { buyer, ticketId: data.id, transactionId };
  }

  it("refuses a policy that isn't one", async () => {
    const { error } = await setPolicy(service, "until_cutoff", 5);
    expect(error?.code).toBe("23514");
  });

  it("lets the organizer tighten the policy before anyone holds a ticket", async () => {
    const { error } = await setPolicy(organizerSession, "until_cutoff", 72);
    expect(error).toBeNull();
  });

  it("only lets it become more generous once people hold tickets", async () => {
    await issueTicket(false);

    const stricter = await setPolicy(organizerSession, "none");
    expect(stricter.error?.code).toBe("42501");
    expect(stricter.error?.message).toMatch(/only become more generous/);

    const longerCutoff = await setPolicy(organizerSession, "until_cutoff", 168);
    expect(longerCutoff.error?.code).toBe("42501");

    const looser = await setPolicy(organizerSession, "until_cutoff", 24);
    expect(looser.error).toBeNull();
    const loosest = await setPolicy(organizerSession, "until_start");
    expect(loosest.error).toBeNull();

    const { data } = await service
      .from("event")
      .select("refund_policy, refund_cutoff_hours")
      .eq("id", eventId)
      .single();
    expect(data).toEqual({
      refund_policy: "until_start",
      refund_cutoff_hours: null,
    });
  });

  it("refuses a buyer's cancel of a paid ticket under no refunds", async () => {
    // Staff (the service) may set it whatever is sold.
    expect((await setPolicy(service, "none")).error).toBeNull();
    const { buyer, ticketId, transactionId } = await issueTicket(true);
    const session = await createSessionClient(buyer);

    const result = await cancelUserTicketCore(
      session,
      buyer.id,
      ticketId,
      transactionId,
    );
    expect(result.status).toBe(409);
    expect(result.message).toMatch(/doesn't offer refunds/);

    const { data } = await service
      .from("ticket")
      .select("status")
      .eq("id", ticketId)
      .single();
    expect(data?.status).toBe("active");
  });

  it("refuses every buyer cancel once the show has started", async () => {
    expect((await setPolicy(service, "until_start")).error).toBeNull();
    const { buyer, ticketId } = await issueTicket(false);
    const session = await createSessionClient(buyer);
    await service
      .from("event")
      .update({
        starts_at: new Date(Date.now() - 3_600_000).toISOString(),
        ends_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .eq("id", eventId);

    const result = await cancelUserTicketCore(
      session,
      buyer.id,
      ticketId,
      null,
    );
    expect(result.status).toBe(409);
    expect(result.message).toMatch(/already started/);
  });
});
