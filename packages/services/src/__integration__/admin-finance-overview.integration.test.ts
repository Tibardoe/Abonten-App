import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDashboardCore } from "../admin/dashboard/getDashboardCore";
import {
  getFinanceOverviewCore,
  getOrganizerFinanceCore,
} from "../admin/finance/financeAdminCore";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// What the admin console reports about money must match the ledgers it reads
// and the figures the organizer sees on their own Finances page:
//
//   * "booked" includes the refund deduction (refund_adjustment), not just
//     earnings — the same entry family get_organizer_finance_overview() sums
//   * "still owed" may go negative after a post-payout refund and must not be
//     clamped to zero
//   * "refunds issued" is cash actually sent back (fee_refund_adjustment,
//     ticket revenue only), never the full charge, and never a refund that is
//     merely requested
//   * "gross ticket sales" is before refunds — `fee` rows only

const service = getServiceClient() as unknown as ServiceRoleClient;

const adminCtx = (userId: string): AdminContext => ({
  userId,
  email: null,
  roles: ["finance_admin"],
  permissions: ["finance.view", "dashboard.view", "transactions.view"],
  reauthenticatedAt: Date.now(),
});

let organizer: TestUser;
let buyer: TestUser;
let eventId: string;
let ticketCheckoutId: string;
let refundedTxnId: string;
let pendingTxnId: string;
let ctx: AdminContext;

// Everything is stamped inside this window so the range filters see it.
const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();

// The suite shares one database, so platform-wide totals already carry
// whatever other files seeded. Every platform-wide assertion below is a
// delta against this baseline, read before this file writes anything (files
// run one at a time -- vitest.integration.config.ts sets fileParallelism:
// false -- so nothing else moves in between).
type Overview = NonNullable<
  Awaited<ReturnType<typeof getFinanceOverviewCore>>["data"]
>;
type Kpis = NonNullable<
  Awaited<ReturnType<typeof getDashboardCore>>["data"]
>["kpis"];
let baseOverview: Overview;
let baseKpis: Kpis;

async function overview(): Promise<Overview> {
  const res = await getFinanceOverviewCore(service, ctx, {
    range: "custom",
    from,
    to,
  });
  expect(res.status).toBe(200);
  if (!res.data) throw new Error(res.message ?? "no data");
  return res.data;
}

async function kpis(): Promise<Kpis> {
  const res = await getDashboardCore(service, ctx, {
    range: "custom",
    from,
    to,
  });
  expect(res.status).toBe(200);
  if (!res.data) throw new Error(res.message ?? "no data");
  return res.data.kpis;
}

beforeAll(async () => {
  organizer = await createTestUser(service);
  buyer = await createTestUser(service);
  ctx = adminCtx(organizer.id);
  baseOverview = await overview();
  baseKpis = await kpis();

  const fixture = await createTestEventWithTicketType(service, organizer.id, {
    quantity: 10,
    price: 100,
  });
  eventId = fixture.eventId;

  const { data: checkout, error: checkoutError } = await service
    .from("ticket_checkout")
    .insert({
      user_id: buyer.id,
      event_id: eventId,
      ticket_type_id: fixture.ticketTypeId,
      quantity: 2,
      unit_price: 100,
      total_price: 200,
      status: "paid",
    })
    .select("id")
    .single();
  if (checkoutError || !checkout) {
    throw new Error(`Fixture setup failed: ${checkoutError?.message}`);
  }
  ticketCheckoutId = checkout.id;

  // Two transactions: one fully refunded, one with a refund only requested.
  const { data: txns, error: txnError } = await service
    .from("transaction")
    .insert([
      {
        user_id: buyer.id,
        full_name: "Test Buyer",
        email: "admin-finance-test@example.test",
        reason: "Ticket_Purchase",
        amount: 210, // 200 ticket revenue + 10 service fee
        currency: "GHS",
        status: "refunded",
        paystack_reference: `admin-fin-refunded-${crypto.randomUUID()}`,
      },
      {
        user_id: buyer.id,
        full_name: "Test Buyer",
        email: "admin-finance-test@example.test",
        reason: "Ticket_Purchase",
        amount: 105,
        currency: "GHS",
        status: "refund_pending",
        paystack_reference: `admin-fin-pending-${crypto.randomUUID()}`,
        refund_requested_at: new Date().toISOString(),
      },
    ])
    .select("id, status");
  if (txnError || txns?.length !== 2) {
    throw new Error(`Fixture setup failed: ${txnError?.message}`);
  }
  refundedTxnId = txns.find((t) => t.status === "refunded")?.id as string;
  pendingTxnId = txns.find((t) => t.status === "refund_pending")?.id as string;

  // The fee ledger: one sale per transaction, plus the refund mirror for the
  // one that was actually refunded (ticket revenue only — the fee is kept).
  const { error: feeError } = await service.from("platform_fee_entry").insert([
    {
      transaction_id: refundedTxnId,
      event_id: eventId,
      entry_type: "fee",
      ticket_revenue: 200,
      service_fee: 10,
      total_customer_payment: 210,
      processing_cost: 3,
      net_revenue: 7,
      fee_rate: 0.05,
      currency: "GHS",
    },
    {
      transaction_id: pendingTxnId,
      event_id: eventId,
      entry_type: "fee",
      ticket_revenue: 100,
      service_fee: 5,
      total_customer_payment: 105,
      // Paystack never reported a cost for this one: unknown, not zero.
      processing_cost: null,
      net_revenue: null,
      fee_rate: 0.05,
      currency: "GHS",
    },
    {
      transaction_id: refundedTxnId,
      event_id: eventId,
      entry_type: "fee_refund_adjustment",
      ticket_revenue: -200,
      service_fee: 0,
      total_customer_payment: -200,
      processing_cost: null,
      net_revenue: null,
      fee_rate: 0.05,
      currency: "GHS",
    },
  ]);
  if (feeError) throw new Error(`Fixture setup failed: ${feeError.message}`);

  // The organizer ledger for the same money: 300 earned, 200 deducted when
  // the refund completed, 100 held while the second refund is in flight, and
  // 250 already paid out — so what is still owed is negative.
  const { error: ledgerError } = await service
    .from("organizer_ledger_entry")
    .insert([
      {
        organizer_id: organizer.id,
        event_id: eventId,
        ticket_checkout_id: ticketCheckoutId,
        entry_type: "earning",
        amount: 300,
        gross_amount: 300,
        fee_amount: 0,
        currency: "GHS",
      },
      {
        organizer_id: organizer.id,
        event_id: eventId,
        ticket_checkout_id: ticketCheckoutId,
        transaction_id: refundedTxnId,
        entry_type: "refund_adjustment",
        amount: -200,
        currency: "GHS",
      },
      {
        organizer_id: organizer.id,
        event_id: eventId,
        ticket_checkout_id: ticketCheckoutId,
        transaction_id: pendingTxnId,
        entry_type: "refund_hold",
        amount: -100,
        currency: "GHS",
      },
    ]);
  if (ledgerError) {
    throw new Error(`Fixture setup failed: ${ledgerError.message}`);
  }

  const { data: account, error: accountError } = await service
    .from("payout_account")
    .insert({
      organizer_id: organizer.id,
      account_type: "mobile_money",
      provider: "MTN",
      account_holder_name: "Test Organizer",
      account_number: "0240000000",
      status: "active",
      is_default: true,
    })
    .select("id")
    .single();
  if (accountError || !account) {
    throw new Error(`Fixture setup failed: ${accountError?.message}`);
  }
  const { data: payout, error: payoutError } = await service
    .from("payout")
    .insert({
      organizer_id: organizer.id,
      payout_account_id: account.id,
      amount: 250,
      currency: "GHS",
      status: "processing",
      reference: `PYT-${crypto.randomUUID().slice(0, 10).toUpperCase()}`,
    })
    .select("id")
    .single();
  if (payoutError || !payout) {
    throw new Error(`Fixture setup failed: ${payoutError?.message}`);
  }
  const { error: holdError } = await service
    .from("organizer_ledger_entry")
    .insert({
      organizer_id: organizer.id,
      payout_id: payout.id,
      entry_type: "payout_hold",
      amount: -250,
      currency: "GHS",
    });
  if (holdError) throw new Error(`Fixture setup failed: ${holdError.message}`);
});

afterAll(async () => {
  await service
    .from("organizer_ledger_entry")
    .delete()
    .eq("organizer_id", organizer.id);
  await service.from("payout").delete().eq("organizer_id", organizer.id);
  await service
    .from("payout_account")
    .delete()
    .eq("organizer_id", organizer.id);
  await service
    .from("platform_fee_entry")
    .delete()
    .in("transaction_id", [refundedTxnId, pendingTxnId]);
  await service
    .from("transaction")
    .delete()
    .in("id", [refundedTxnId, pendingTxnId]);
  await service.from("ticket_checkout").delete().eq("id", ticketCheckoutId);
  await deleteTestEvent(service, eventId);
  await deleteTestUser(service, buyer.id);
  await deleteTestUser(service, organizer.id);
});

describe("admin finance overview", () => {
  it("reports gross ticket sales before refunds and refunds separately", async () => {
    const d = await overview();

    // 200 + 100 from the two `fee` rows. The -200 refund mirror must not be
    // folded in, or "gross" would silently mean "net of refunds".
    expect(d.ticketRevenue - baseOverview.ticketRevenue).toBe(300);
    expect(d.serviceFeeRevenue - baseOverview.serviceFeeRevenue).toBe(15);
    expect(d.totalCustomerPayments - baseOverview.totalCustomerPayments).toBe(
      315,
    );

    // Only the row whose processing cost Paystack reported contributes: the
    // NULL-cost one is unknown, not zero.
    expect(d.netPlatformRevenue - baseOverview.netPlatformRevenue).toBe(7);
    expect(d.processingCost - baseOverview.processingCost).toBe(3);
    expect(d.feeEntries - baseOverview.feeEntries).toBe(2);
    expect(
      d.feeEntriesWithKnownCost - baseOverview.feeEntriesWithKnownCost,
    ).toBe(1);
  });

  it("counts cash actually refunded, not the full charge, and not pending requests", async () => {
    const d = await overview();

    // One refund issued, 200 sent back: the 10 service fee is retained and
    // the charge was 210, so the old "sum transaction.amount" reading of 210
    // would have been wrong.
    expect(d.refundsCompleted - baseOverview.refundsCompleted).toBe(1);
    expect(d.refundsCompletedAmount - baseOverview.refundsCompletedAmount).toBe(
      200,
    );

    // The requested-but-not-issued refund is pending, not completed, and its
    // refundable amount is ticket revenue only (100 of the 105 charged).
    expect(d.refundsPending - baseOverview.refundsPending).toBe(1);
    expect(d.refundsPendingAmount - baseOverview.refundsPendingAmount).toBe(
      100,
    );
  });

  it("includes the refund deduction in organizer earnings and lets 'still owed' go negative", async () => {
    const res = await getOrganizerFinanceCore(service, ctx, organizer.id);
    expect(res.status).toBe(200);
    const d = res.data;
    if (!d) throw new Error("no data");

    // 300 earned − 200 refund deduction.
    expect(d.earned).toBe(100);
    expect(d.held).toBe(100);
    expect(d.paidOut).toBe(250);
    // 100 − 250 − 100. Clamping this to zero would hide that the organizer
    // was paid money that refunds later took back.
    expect(d.outstanding).toBe(-250);
  });

  it("matches the organizer's own finance figures", async () => {
    // get_organizer_finance_overview() runs as the organizer (auth.uid()) and
    // is what they see on their own Finances page. The admin console must
    // never disagree with it.
    const { data: own, error } = await organizer.client.rpc(
      "get_organizer_finance_overview",
    );
    expect(error).toBeNull();
    const ghs = (own ?? []).find((r) => r.currency === "GHS");
    if (!ghs) throw new Error("organizer RPC returned no GHS row");

    const res = await getOrganizerFinanceCore(service, ctx, organizer.id);
    const d = res.data;
    if (!d) throw new Error("no data");

    // total_earnings is the whole earning family, the same set the admin
    // "earned" figure sums (earnings + refund deductions + holds).
    expect(Number(ghs.total_earnings)).toBe(d.earned - d.held);
  });
});

describe("admin dashboard money figures", () => {
  it("separates gross sales from refunds", async () => {
    const k = await kpis();

    expect(k.grossTicketSales - baseKpis.grossTicketSales).toBe(300);
    expect(k.platformFeeRevenue - baseKpis.platformFeeRevenue).toBe(15);
    // Cash refunded is positive money that went back out, read from the
    // refund mirror, never the pending request and never the retained fee.
    expect(k.refunds - baseKpis.refunds).toBe(200);
    expect(k.refundsCount - baseKpis.refundsCount).toBe(1);
  });
});
