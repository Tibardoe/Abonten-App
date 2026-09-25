import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Production gate (2026-09-25), follow-up to migration 20260925110900: a
// staff account — whatever its role — has no more power over the Data API
// than any other signed-in person. Staff act through the admin console,
// which checks the permission, asks for step-up where needed and writes the
// audit log, all with the service role. For every role in the live matrix
// this suite tries, with the staffer's own session, to change someone
// else's profile, place, event, claim, ticket and money records, the
// market configuration and the admin records themselves, and checks the
// rows afterwards (a refused write and a silently filtered one both leave
// them unchanged). It also records what each role can READ of the admin
// and market tables (nothing, by design).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

describe("staff roles have no direct Data API powers", () => {
  let service: SupabaseClient<Database>;
  let victim: TestUser;
  let eventId: string;
  let ticketTypeId: string;
  let placeId: string;
  let claimId: string;
  let ticketId: string;
  let transactionId: string;
  const staff = new Map<string, TestUser>();
  let roleKeys: string[] = [];

  beforeAll(async () => {
    service = getServiceClient();
    victim = await createTestUser(service);
    const { data: roles } = await service.from("admin_role").select("key");
    roleKeys = (roles ?? []).map((r) => r.key as string).sort();
    for (const key of roleKeys) {
      const u = await createTestUser(service);
      await service
        .from("admin_user")
        .insert({ user_id: u.id, status: "active" });
      await service
        .from("admin_user_role")
        .insert({ user_id: u.id, role_key: key });
      staff.set(key, u);
    }
    ({ eventId, ticketTypeId } = await createTestEventWithTicketType(
      service,
      victim.id,
      { quantity: 5, price: 20 },
    ));
    const { data: category } = await service
      .from("place_category")
      .select("id")
      .limit(1)
      .single();
    const { data: place, error: placeError } = await service
      .from("place")
      .insert({
        country_code: "GH",
        timezone: "Africa/Accra",
        owner_id: victim.id,
        name: "Staff Regression Venue",
        slug: `staff-regression-${crypto.randomUUID()}`,
        description: "Created by the staff access suite.",
        category_id: category?.id as number,
        location: "POINT(-0.187 5.6037)",
        address: { city: "Accra" },
        cover_public_id: "test/cover",
        cover_version: "1",
        status: "published",
      } as never)
      .select("id")
      .single();
    if (!place) throw new Error(`place: ${placeError?.message}`);
    placeId = (place as { id: string }).id;
    const { data: claim, error: claimError } = await service
      .from("place_claim_request")
      .insert({ place_id: placeId, claimant_id: victim.id } as never)
      .select("id")
      .single();
    if (claimError) throw new Error(`claim: ${claimError.message}`);
    claimId = (claim as { id: string }).id;
    const { data: ticket, error: ticketError } = await service
      .from("ticket")
      .insert({
        user_id: victim.id,
        ticket_type_id: ticketTypeId,
        ticket_code: `TKT-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
        qr_public_id: "test/qr",
        qr_version: "1",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      } as never)
      .select("id")
      .single();
    if (ticketError) throw new Error(`ticket: ${ticketError.message}`);
    ticketId = (ticket as { id: string }).id;
    const { data: txn } = await service
      .from("transaction")
      .insert({
        user_id: victim.id,
        full_name: "Victim",
        email: victim.email,
        reason: "Ticket_Purchase",
        amount: 21,
        currency: "GHS",
        status: "successful",
        provider: "paystack",
        provider_reference: `PSK-${crypto.randomUUID()}`,
      } as never)
      .select("id")
      .single();
    transactionId = (txn as { id: string }).id;
  }, 120_000);

  afterAll(async () => {
    await service.from("transaction").delete().eq("id", transactionId);
    await service.from("ticket").delete().eq("id", ticketId);
    await service.from("place_claim_request").delete().eq("id", claimId);
    await service.from("place").delete().eq("id", placeId);
    await deleteTestEvent(service, eventId).catch(() => undefined);
    for (const u of staff.values()) {
      await service.from("admin_user_role").delete().eq("user_id", u.id);
      await service.from("admin_user").delete().eq("user_id", u.id);
      await deleteTestUser(service, u.id);
    }
    await deleteTestUser(service, victim.id);
  }, 120_000);

  it("every role in the live matrix is covered", () => {
    expect(roleKeys.length).toBeGreaterThanOrEqual(7);
  });

  it("no role can change another person's records or the configuration", async () => {
    const snapshot = async () => {
      const [ui, pl, ev, cl, tk, tx, mk, fee, au, aur, arp] = await Promise.all(
        [
          service
            .from("user_info")
            .select("full_name, status_id, is_admin")
            .eq("id", victim.id)
            .single(),
          service
            .from("place")
            .select("name, verified, claimed, owner_id, moderation_state")
            .eq("id", placeId)
            .single(),
          service
            .from("event")
            .select("title, featured, moderation_state, status")
            .eq("id", eventId)
            .single(),
          service
            .from("place_claim_request")
            .select("status")
            .eq("id", claimId)
            .single(),
          service
            .from("ticket")
            .select("status, user_id")
            .eq("id", ticketId)
            .single(),
          service
            .from("transaction")
            .select("amount, status")
            .eq("id", transactionId)
            .single(),
          service
            .from("market")
            .select("status")
            .eq("country_code", "GH")
            .single(),
          service.from("platform_fee_config").select("*"),
          service
            .from("admin_user")
            .select("user_id", { count: "exact", head: true }),
          service
            .from("admin_user_role")
            .select("user_id", { count: "exact", head: true }),
          service
            .from("admin_role_permission")
            .select("role_key", { count: "exact", head: true }),
        ],
      );
      return JSON.stringify([
        ui.data,
        pl.data,
        ev.data,
        cl.data,
        tk.data,
        tx.data,
        mk.data,
        fee.data,
        au.count,
        aur.count,
        arp.count,
      ]);
    };
    const before = await snapshot();
    const reads: string[] = [];

    for (const [key, u] of staff) {
      const c = u.client;
      await c
        .from("user_info")
        .update({
          full_name: `${key} was here`,
          status_id: 3,
          is_admin: true,
        } as never)
        .eq("id", victim.id);
      await c
        .from("user_info")
        .update({ is_admin: true } as never)
        .eq("id", u.id);
      await c
        .from("place")
        .update({
          name: `${key} was here`,
          verified: true,
          claimed: true,
          owner_id: u.id,
          moderation_state: "removed",
        } as never)
        .eq("id", placeId);
      await c
        .from("event")
        .update({ title: `${key} was here` } as never)
        .eq("id", eventId);
      await c
        .from("event")
        .update({ featured: true, moderation_state: "hidden" } as never)
        .eq("id", eventId);
      await c
        .from("place_claim_request")
        .update({ status: "approved" } as never)
        .eq("id", claimId);
      await c
        .from("ticket")
        .update({ status: "cancelled", user_id: u.id } as never)
        .eq("id", ticketId);
      await c
        .from("transaction")
        .update({ amount: 0, status: "refunded" } as never)
        .eq("id", transactionId);
      await c.from("organizer_ledger_entry").insert({
        organizer_id: u.id,
        entry_type: "earning",
        amount: 1000,
        currency: "GHS",
      } as never);
      await c
        .from("market")
        .update({ status: "paused" } as never)
        .eq("country_code", "GH");
      await c
        .from("platform_fee_config")
        .update({ fee_rate: 0 } as never)
        .neq("fee_rate", -1);
      await c
        .from("admin_user")
        .insert({ user_id: victim.id, status: "active" } as never);
      await c
        .from("admin_user_role")
        .insert({ user_id: u.id, role_key: "super_admin" } as never);
      await c
        .from("admin_role_permission")
        .insert({ role_key: key, permission_key: "finance.payout" } as never);
      await c
        .from("admin_audit_log")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

      for (const table of [
        "admin_user",
        "admin_user_role",
        "admin_role_permission",
        "admin_audit_log",
        "market",
        "market_payment_provider",
      ]) {
        const { data } = await c
          .from(table as never)
          .select("*")
          .limit(1);
        if ((data ?? []).length > 0) reads.push(`${key} reads ${table}`);
      }
    }

    expect(await snapshot()).toBe(before);
    expect(reads).toEqual([]);
  });
});
