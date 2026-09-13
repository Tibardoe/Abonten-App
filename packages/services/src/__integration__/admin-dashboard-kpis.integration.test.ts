import { resolveAdminRange } from "@abonten/core/admin/adminDateRange";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDashboardCore } from "../admin/dashboard/getDashboardCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// The dashboard's definitions, checked against rows whose meaning we chose:
//
//   * a draft event does not make someone an organizer
//   * a cancelled ticket is not a sale, and a free registration is not one
//     either — they are counted separately
//   * the window is half-open, so a row on the boundary lands in exactly one
//     of the current and previous windows
//   * only service_role may call the RPC

const service = getServiceClient() as unknown as ServiceRoleClient;

const ctxFor = (userId: string): AdminContext => ({
  userId,
  email: null,
  roles: ["analyst"],
  permissions: ["dashboard.view"],
  reauthenticatedAt: Date.now(),
});

let organizer: TestUser;
let buyer: TestUser;
let draftOrganizer: TestUser;
let eventId: string;
let draftEventId: string;
let ticketTypeId: string;
let ctx: AdminContext;

type Snapshot = NonNullable<
  Awaited<ReturnType<typeof getDashboardCore>>["data"]
>;

// The window has to be resolved per call: its end is "now", so a range
// captured before the fixtures were written would exclude them.
async function load(): Promise<Snapshot> {
  const res = await getDashboardCore(service, ctx, resolveAdminRange("30d"));
  expect(res.status).toBe(200);
  if (!res.data) throw new Error(res.message ?? "no data");
  return res.data;
}

let before: Snapshot;

beforeAll(async () => {
  // Baseline first: the suite shares one database, and these fixtures are
  // about to move the very counts being asserted.
  ctx = ctxFor(crypto.randomUUID());
  before = await load();

  organizer = await createTestUser(service);
  buyer = await createTestUser(service);
  draftOrganizer = await createTestUser(service);
  ctx = ctxFor(organizer.id);

  const fixture = await createTestEventWithTicketType(service, organizer.id, {
    quantity: 20,
    price: 40,
  });
  eventId = fixture.eventId;
  ticketTypeId = fixture.ticketTypeId;

  // A second organizer whose only event stays a draft: they must not be
  // counted as an organizer.
  const draft = await createTestEventWithTicketType(
    service,
    draftOrganizer.id,
    {
      quantity: 5,
      price: 10,
    },
  );
  draftEventId = draft.eventId;
  await service
    .from("event")
    .update({ status: "draft" })
    .eq("id", draftEventId);

  const { data: txn, error: txnError } = await service
    .from("transaction")
    .insert({
      user_id: buyer.id,
      full_name: "Dashboard Test Buyer",
      email: "admin-dashboard-test@example.test",
      reason: "Ticket_Purchase",
      amount: 42,
      currency: "GHS",
      status: "successful",
      paystack_reference: `admin-dash-${crypto.randomUUID()}`,
    })
    .select("id")
    .single();
  if (txnError || !txn) {
    throw new Error(`Fixture setup failed: ${txnError?.message}`);
  }

  const now = new Date().toISOString();
  const { error: ticketError } = await service.from("ticket").insert([
    // A sale.
    {
      user_id: buyer.id,
      transaction_id: txn.id,
      ticket_type_id: ticketTypeId,
      status: "active",
      qr_public_id: "test/qr",
      qr_version: "1",
      issued_at: now,
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
    // Sold, then cancelled: not a sale any more.
    {
      user_id: buyer.id,
      transaction_id: txn.id,
      ticket_type_id: ticketTypeId,
      status: "cancelled",
      qr_public_id: "test/qr",
      qr_version: "1",
      issued_at: now,
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
    // A free registration: real attendance, but not money.
    {
      user_id: organizer.id,
      transaction_id: null,
      ticket_type_id: ticketTypeId,
      status: "active",
      qr_public_id: "test/qr",
      qr_version: "1",
      issued_at: now,
      expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
  ]);
  if (ticketError) {
    throw new Error(`Fixture setup failed: ${ticketError.message}`);
  }
});

afterAll(async () => {
  await service.from("ticket").delete().eq("ticket_type_id", ticketTypeId);
  await service
    .from("transaction")
    .delete()
    .eq("email", "admin-dashboard-test@example.test");
  await deleteTestEvent(service, eventId);
  await deleteTestEvent(service, draftEventId);
  await deleteTestUser(service, buyer.id);
  await deleteTestUser(service, organizer.id);
  await deleteTestUser(service, draftOrganizer.id);
});

describe("admin dashboard KPIs", () => {
  it("counts a paid ticket as a sale and a cancelled one as neither", async () => {
    const after = await load();
    expect(after.current.paidTickets - before.current.paidTickets).toBe(1);
    expect(
      after.current.ticketsCancelled - before.current.ticketsCancelled,
    ).toBe(1);
  });

  it("keeps free registrations out of sales", async () => {
    const after = await load();
    expect(
      after.current.freeRegistrations - before.current.freeRegistrations,
    ).toBe(1);
  });

  it("does not count someone whose only event is a draft as an organizer", async () => {
    const after = await load();
    // Two new users, one published event, one draft: exactly one organizer.
    expect(after.snapshot.organizers - before.snapshot.organizers).toBe(1);
    expect(
      after.snapshot.eventsPublished - before.snapshot.eventsPublished,
    ).toBe(1);
    // The draft still exists, so the all-statuses total moves by two.
    expect(after.snapshot.eventsAll - before.snapshot.eventsAll).toBe(2);
  });

  it("counts only accounts that can sign in as active users", async () => {
    const after = await load();
    const added = after.snapshot.allAccounts - before.snapshot.allAccounts;
    expect(added).toBe(3);
    expect(after.snapshot.activeUsers - before.snapshot.activeUsers).toBe(3);

    await service
      .from("user_info")
      .update({ status_id: 2 })
      .eq("id", draftOrganizer.id);
    const suspended = await load();
    expect(suspended.snapshot.activeUsers - before.snapshot.activeUsers).toBe(
      2,
    );
    // A suspended account is still an account.
    expect(suspended.snapshot.allAccounts - before.snapshot.allAccounts).toBe(
      3,
    );
    await service
      .from("user_info")
      .update({ status_id: 1 })
      .eq("id", draftOrganizer.id);
  });

  it("puts a row in exactly one of the current and previous windows", async () => {
    const range = resolveAdminRange("30d");
    // The previous window ends exactly where the current one starts.
    expect(range.prevTo).toBe(range.from);

    // A row stamped at that exact instant belongs to the current window
    // (inclusive start), never to both.
    const boundary = range.from;
    const { data: edge } = await service
      .from("transaction")
      .insert({
        user_id: buyer.id,
        full_name: "Boundary",
        email: "admin-dashboard-boundary@example.test",
        reason: "Ticket_Purchase",
        amount: 1,
        currency: "GHS",
        status: "successful",
        paystack_reference: `admin-dash-edge-${crypto.randomUUID()}`,
        created_at: boundary,
      })
      .select("id")
      .single();

    const after = await load();
    expect(
      after.current.paymentsSuccessful - before.current.paymentsSuccessful,
    ).toBe(2);
    expect(
      after.previous.paymentsSuccessful - before.previous.paymentsSuccessful,
    ).toBe(0);

    if (edge) await service.from("transaction").delete().eq("id", edge.id);
  });

  it("refuses the RPC to a signed-in user", async () => {
    // The figures include platform-wide money; only the service role may ask.
    const range = resolveAdminRange("30d");
    const { error } = await buyer.client.rpc("admin_dashboard_kpis", {
      p_from: range.from,
      p_to: range.to,
      p_prev_from: range.prevFrom ?? range.from,
      p_prev_to: range.prevTo ?? range.from,
    });
    expect(error).not.toBeNull();
  });

  it("refuses an admin without dashboard.view", async () => {
    const res = await getDashboardCore(
      service,
      { ...ctxFor(organizer.id), permissions: ["users.view"] },
      resolveAdminRange("30d"),
    );
    expect(res.status).toBe(403);
  });
});
