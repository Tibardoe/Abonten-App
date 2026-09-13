import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Account deletion keeps the financial record (migration
// 20260913200100_account_deletion_preserves_records): an organizer who
// still has attendees is blocked; once clear, the profile is anonymised,
// their events leave discovery, and the buyer's ticket and transaction
// rows survive the soft delete of the auth user.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAccountCore } from "../profile/deleteAccountCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type Blockers = {
  is_admin: boolean;
  upcoming_events_with_attendees: number;
  payouts_in_flight: number;
  balance_owed: number;
};

describe("account deletion keeps the financial record", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let buyer: TestUser;
  let eventId: string;
  let ticketTypeId: string;
  let ticketId: string;
  let transactionId: string;

  beforeAll(async () => {
    service = getServiceClient();
    [organizer, buyer] = await Promise.all([
      createTestUser(service),
      createTestUser(service),
    ]);
    const fixture = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 10,
    });
    eventId = fixture.eventId;
    ticketTypeId = fixture.ticketTypeId;

    const { data: txn, error: txnError } = await service
      .from("transaction")
      .insert({
        user_id: buyer.id,
        full_name: "Buyer",
        email: buyer.email,
        reason: "Ticket_Purchase",
        amount: 50,
        currency: "GHS",
        status: "successful",
        payment_method: "paystack",
        paystack_reference: `DEL-${crypto.randomUUID()}`,
      })
      .select("id")
      .single();
    expect(txnError).toBeNull();
    transactionId = txn?.id as string;

    const { data: ticket, error: ticketError } = await service
      .from("ticket")
      .insert({
        user_id: buyer.id,
        ticket_type_id: ticketTypeId,
        transaction_id: transactionId,
        status: "active",
        qr_public_id: "test/qr",
        qr_version: "1",
        ticket_code: `T-${crypto.randomUUID().slice(0, 8)}`,
        expires_at: new Date(Date.now() + 90_000_000).toISOString(),
      })
      .select("id")
      .single();
    expect(ticketError).toBeNull();
    ticketId = ticket?.id as string;
  });

  afterAll(async () => {
    await service.from("ticket").delete().eq("id", ticketId);
    await service.from("transaction").delete().eq("id", transactionId);
    await deleteTestEvent(service, eventId);
    await deleteTestUser(service, organizer.id);
    await deleteTestUser(service, buyer.id);
  });

  async function blockers(userId: string): Promise<Blockers> {
    const { data, error } = await service.rpc("account_deletion_blockers", {
      p_user_id: userId,
    });
    expect(error).toBeNull();
    return data as unknown as Blockers;
  }

  it("blocks an organizer whose upcoming event still has attendees", async () => {
    const b = await blockers(organizer.id);
    expect(Number(b.upcoming_events_with_attendees)).toBe(1);
    expect(b.is_admin).toBe(false);
  });

  it("does not block the buyer, and their deletion keeps ticket + transaction", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

    const b = await blockers(buyer.id);
    expect(Number(b.upcoming_events_with_attendees)).toBe(0);

    // The buyer also had a saved card and a favourite.
    await service.from("payment_method").insert({
      user_id: buyer.id,
      method_type: "card",
      details: { brand: "visa", last4: "1111", authorizationCode: "AUTH_x" },
      status: "active",
    });
    await service
      .from("favorite")
      .insert({ user_id: buyer.id, event_id: eventId });

    const res = await deleteAccountCore(buyer.id, { serviceClient: service });
    expect(res.status).toBe(200);

    // Financial record intact.
    const { data: ticket } = await service
      .from("ticket")
      .select("id, user_id, status")
      .eq("id", ticketId)
      .maybeSingle();
    expect(ticket?.user_id).toBe(buyer.id);
    expect(ticket?.status).toBe("active");
    const { data: txn } = await service
      .from("transaction")
      .select("id, amount")
      .eq("id", transactionId)
      .maybeSingle();
    expect(Number(txn?.amount)).toBe(50);

    // Profile anonymised, personal rows gone, card scrubbed.
    const { data: profile } = await service
      .from("user_info")
      .select("full_name, username, status_id, avatar_public_id")
      .eq("id", buyer.id)
      .single();
    expect(profile?.full_name).toBe("Deleted user");
    expect(String(profile?.username)).toMatch(/^deleted_[0-9a-f]{12}$/);
    expect(profile?.status_id).toBe(4);
    const { count: favourites } = await service
      .from("favorite")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", buyer.id);
    expect(favourites).toBe(0);
    const { data: cards } = await service
      .from("payment_method")
      .select("status, details")
      .eq("user_id", buyer.id);
    expect(cards?.[0]?.status).toBe("removed");
    expect(
      (cards?.[0]?.details as Record<string, unknown>).authorizationCode,
    ).toBeUndefined();

    // Soft delete: the auth row survives (so nothing cascades) but the old
    // credentials no longer work.
    const { data: authUser } = await service.auth.admin.getUserById(buyer.id);
    expect(authUser.user).not.toBeNull();
    const { error: signIn } = await buyer.client.auth.signInWithPassword({
      email: buyer.email,
      password: "test-password-not-real-12345",
    });
    expect(signIn).not.toBeNull();
  });

  it("once the attendee is gone, the organizer can leave: events archived, profile anonymised", async () => {
    await service
      .from("ticket")
      .update({ status: "cancelled" })
      .eq("id", ticketId);
    expect(
      Number((await blockers(organizer.id)).upcoming_events_with_attendees),
    ).toBe(0);

    const { data: result, error } = await service.rpc(
      "anonymize_deleted_account",
      { p_user_id: organizer.id },
    );
    expect(error).toBeNull();
    const r = result as unknown as Record<string, number>;
    // The event had no active tickets left, so it is cancelled and archived.
    expect(Number(r.events_cancelled)).toBe(1);
    expect(Number(r.events_archived)).toBe(1);

    const { data: event } = await service
      .from("event")
      .select("status, archived_at, organizer_id")
      .eq("id", eventId)
      .single();
    expect(event?.status).toBe("canceled");
    expect(event?.archived_at).not.toBeNull();
    expect(event?.organizer_id).toBe(organizer.id);

    // The buyer's (cancelled) ticket still points at its ticket type.
    const { data: ticket } = await service
      .from("ticket")
      .select("ticket_type_id")
      .eq("id", ticketId)
      .single();
    expect(ticket?.ticket_type_id).toBe(ticketTypeId);
  });
});
