import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Payout requests, free registrations and door check-ins are gated in the database, not
// only in the apps (migration 20260925110000):
//   * a payout goes to an account in its own currency, at that currency's
//     precision, and never for a restricted account;
//   * issue_free_ticket (which trusts its ticket code, QR and expiry) is
//     the server's alone.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkInTicketCore } from "../tickets/checkInTicketCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("payout and free-registration gates", () => {
  let service: SupabaseClient<Database>;
  let organizer: TestUser;
  let accountId: string;
  let eventId: string;

  beforeAll(async () => {
    service = getServiceClient();
    organizer = await createTestUser(service);
    const { data, error } = await service
      .from("payout_account")
      .insert({
        organizer_id: organizer.id,
        account_type: "mobile_money",
        account_holder_name: "Ama Mensah",
        account_number: "0551234987",
        provider: "MTN",
        country_code: "GH",
        currency: "GHS",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    accountId = data.id;
    ({ eventId } = await createTestEventWithTicketType(service, organizer.id, {
      quantity: 5,
      price: 0,
    }));
  });

  afterAll(async () => {
    await deleteTestEvent(service, eventId).catch(() => undefined);
    await service.from("payout_account").delete().eq("id", accountId);
    await deleteTestUser(service, organizer.id);
  });

  const request = (amount: number, currency: string) =>
    organizer.client.rpc("request_organizer_payout", {
      p_payout_account_id: accountId,
      p_amount: amount,
      p_currency: currency,
    });

  it("refuses a payout in a currency the account is not held in", async () => {
    const { error } = await request(10, "NGN");
    expect(error?.message).toMatch(/payout account currency/i);
  });

  it("refuses an amount finer than the currency allows", async () => {
    const { error } = await request(10.005, "GHS");
    expect(error?.message).toMatch(/precision/i);
  });

  it("still checks the balance for a well-formed request", async () => {
    const { error } = await request(10, "ghs");
    expect(error?.message).toMatch(/exceeds available balance/i);
  });

  it("refuses a restricted account even with a live token", async () => {
    await service
      .from("user_info")
      .update({ status_id: 2 })
      .eq("id", organizer.id);
    try {
      const { error } = await request(10, "GHS");
      expect(error?.message).toMatch(/restricted/i);
    } finally {
      await service
        .from("user_info")
        .update({ status_id: 1 })
        .eq("id", organizer.id);
    }
  });

  it("does not let a signed-in account issue its own free ticket", async () => {
    const { error } = await organizer.client.rpc("issue_free_ticket", {
      p_user_id: organizer.id,
      p_event_id: eventId,
      p_occurrence_id: null,
      p_ticket_code: "TKT-CHOSEN1",
      p_qr_public_id: "any/qr",
      p_qr_version: "1",
      p_expires_at: "2099-01-01T00:00:00Z",
    } as unknown as Database["public"]["Functions"]["issue_free_ticket"]["Args"]);
    expect(error?.code).toBe("42501");
  });
});

describe("door check-in under concurrency", () => {
  it("two doors scanning the same ticket admit it once", async () => {
    const service = getServiceClient();
    const organizer = await createTestUser(service);
    const guest = await createTestUser(service);
    const { eventId } = await createTestEventWithTicketType(
      service,
      organizer.id,
      { quantity: 5, price: 0 },
    );
    try {
      await service
        .from("ticket_type")
        .update({ type: "FREE" })
        .eq("event_id", eventId);
      const code = `TKT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const { error } = await service.rpc("issue_free_ticket", {
        p_user_id: guest.id,
        p_event_id: eventId,
        p_occurrence_id: null,
        p_ticket_code: code,
        p_qr_public_id: "test/qr",
        p_qr_version: "1",
        p_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      } as unknown as Database["public"]["Functions"]["issue_free_ticket"]["Args"]);
      expect(error).toBeNull();
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          checkInTicketCore(
            organizer.client,
            organizer.id,
            code,
            true,
            eventId,
          ),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    } finally {
      await deleteTestEvent(service, eventId).catch(() => undefined);
      await Promise.all(
        [organizer, guest].map((u) => deleteTestUser(service, u.id)),
      );
    }
  });
});
