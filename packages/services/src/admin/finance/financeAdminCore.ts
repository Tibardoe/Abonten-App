import type { ResolvedAdminRange } from "@abonten/core/admin/adminDateRange";
import { logger } from "@abonten/core/logger";
import { maskAccountNumber } from "@abonten/core/maskAccountNumber";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  AdminFinanceOverview,
  AdminFinanceWindow,
  AdminOrganizerBalance,
} from "@abonten/types/adminMetrics";
import type {
  AdminContext,
  DashboardRange,
  FeeEntryView,
  FinanceOverview,
  LedgerEntryView,
  OrganizerFinanceSummary,
  PayoutListItem,
  PayoutReviewEvent,
  RefundListItem,
  TransactionDetail,
  TransactionListItem,
} from "@abonten/types/adminTypes";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { getDefaultMarket } from "../../markets/marketConfig";
import { type AdminEnvelope, assertPermission } from "../adminContext";
import { currencyList } from "../shared/metricRows";

// READ-ONLY Finance ops centre (Phase 3). Reconciliation + investigation
// only — no admin-initiated refund/payout here (that is a later phase and
// gets its own step-up-gated actions). Day boundaries are UTC for every
// market, one definition across the console; money is never summed across
// currencies (each figure carries its own).

const REFUND_STATUSES = ["refund_pending", "refunded"];

function resolveRange(
  range: DashboardRange,
  from?: string,
  to?: string,
): { from: string; to: string } {
  const now = new Date();
  const startOfUtcDay = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (range === "custom" && from && to) return { from, to };
  const iso = now.toISOString();
  const daysAgo = (n: number) =>
    new Date(now.getTime() - n * 86_400_000).toISOString();
  switch (range) {
    case "today":
      return { from: startOfUtcDay(now).toISOString(), to: iso };
    case "yesterday":
      return {
        from: startOfUtcDay(new Date(now.getTime() - 86_400_000)).toISOString(),
        to: startOfUtcDay(now).toISOString(),
      };
    case "7d":
      return { from: daysAgo(7), to: iso };
    case "90d":
      return { from: daysAgo(90), to: iso };
    default:
      return { from: daysAgo(30), to: iso };
  }
}

async function orgNames(
  supabase: ServiceRoleClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase
    .from("user_info")
    .select("id, full_name, username")
    .in("id", unique);
  const m = new Map<string, string>();
  for (const r of data ?? [])
    m.set(r.id, r.full_name || r.username || r.id.slice(0, 8));
  return m;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

// ─────────────────────────────────────────────────────────────
// Overview
// ─────────────────────────────────────────────────────────────

function toFinanceWindow(raw: unknown): AdminFinanceWindow {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    ticketRevenue: num(r.ticket_revenue),
    totalCharged: num(r.total_charged),
    serviceFeeRevenue: num(r.service_fee_revenue),
    processingCost: num(r.processing_cost),
    netPlatformRevenue: num(r.net_platform_revenue),
    feeEntries: num(r.fee_entries),
    feeEntriesWithKnownCost: num(r.fee_entries_with_known_cost),
    creditApplied: num(r.credit_applied),
    ordersUsingCredit: num(r.orders_using_credit),
    refundsIssued: num(r.refunds_issued),
    cashRefunded: num(r.cash_refunded),
    paymentsSuccessful: num(r.payments_successful),
  };
}

export function toOrganizerBalances(raw: unknown): AdminOrganizerBalance[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      currency: typeof r.currency === "string" ? r.currency : "",
      booked: num(r.booked),
      refundsDeducted: num(r.refundsDeducted),
      totalEarnings: num(r.totalEarnings),
      pendingSettlement: num(r.pendingSettlement),
      available: num(r.available),
      paidOut: num(r.paidOut),
      payoutsInFlight: num(r.payoutsInFlight),
      payoutsInFlightAmount: num(r.payoutsInFlightAmount),
    };
  });
}

export type FinanceOverviewV2 = AdminFinanceOverview & {
  range: ResolvedAdminRange;
};

/**
 * Customer money for the window, refunds waiting right now, and organizer
 * money per currency — all from `admin_finance_overview`, which uses the same
 * ledger rules as the organizer's own Finances page.
 */
export async function getFinanceOverviewCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  range: ResolvedAdminRange,
  currency?: string | null,
): Promise<AdminEnvelope<FinanceOverviewV2>> {
  try {
    assertPermission(ctx, "finance.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data, error } = await supabase.rpc("admin_finance_overview", {
    p_from: range.from,
    p_to: range.to,
    p_prev_from: range.prevFrom ?? range.from,
    p_prev_to: range.prevTo ?? range.from,
    p_currency: currency ?? undefined,
  });

  if (error) {
    logger.error(`getFinanceOverviewCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load the finance figures." };
  }

  const d = (data ?? {}) as Record<string, unknown>;
  return {
    status: 200,
    data: {
      range,
      current: toFinanceWindow(d.current),
      previous: toFinanceWindow(d.previous),
      refundsPending: num(d.refundsPending),
      refundsPendingAmount: num(d.refundsPendingAmount),
      organizerMoney: toOrganizerBalances(d.organizerMoney),
      activeFeeRate: d.activeFeeRate == null ? null : num(d.activeFeeRate),
      currency: typeof d.currency === "string" ? d.currency : "",
      currencies: currencyList(d.currencies),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Transactions
// ─────────────────────────────────────────────────────────────

export type ListTransactionsFilters = {
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  cursor?: string | null;
  pageSize?: number;
};

export async function listTransactionsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: ListTransactionsFilters = {},
): Promise<PaginatedResult<TransactionListItem>> {
  try {
    assertPermission(ctx, "transactions.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const canPii = ctx.permissions.includes("users.view_pii");
  const pageSize = filters.pageSize ?? DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("transaction")
    .select(
      "id, status, amount, currency, reason, full_name, email, provider_reference, payment_method, created_at, refund_requested_at",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", filters.to);
  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%,()]/g, "");
    query = query.or(
      `provider_reference.ilike.%${s}%,email.ilike.%${s}%,full_name.ilike.%${s}%,phone_number.ilike.%${s}%`,
    );
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listTransactionsCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const mapped: TransactionListItem[] = (data ?? []).map((t) => ({
    id: t.id,
    status: t.status,
    amount: num(t.amount),
    currency: t.currency ?? "",
    reason: t.reason ?? null,
    payerName: t.full_name ?? null,
    payerEmail: canPii ? (t.email ?? null) : null,
    providerReference: t.provider_reference ?? null,
    paymentMethod: t.payment_method ?? null,
    createdAt: t.created_at,
    refundRequestedAt: t.refund_requested_at ?? null,
  }));

  const { page, hasNextPage } = splitPage(mapped, pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.createdAt),
          id: last.id,
        })
      : null;
  return { status: 200, data: page, nextCursor, hasNextPage };
}

export async function getTransactionDetailCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  txId: string,
): Promise<AdminEnvelope<TransactionDetail>> {
  try {
    assertPermission(ctx, "transactions.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { data: t, error } = await supabase
    .from("transaction")
    .select("*")
    .eq("id", txId)
    .maybeSingle();
  if (error) {
    logger.error(`getTransactionDetailCore failed: ${error.message}`);
    return { status: 500, message: "Something went wrong" };
  }
  if (!t) return { status: 404, message: "Transaction not found" };

  const canPii = ctx.permissions.includes("users.view_pii");

  const [
    { data: attempts },
    { data: ledger },
    { data: fees },
    { data: ticketRows },
    { data: refundable },
  ] = await Promise.all([
    supabase
      .from("payment_attempt")
      .select(
        "id, status, provider, provider_reference, amount, currency, failure_reason, paid_at, verified_at, created_at",
      )
      .eq("transaction_id", txId)
      .order("created_at", { ascending: true }),
    supabase
      .from("organizer_ledger_entry")
      .select(
        "id, entry_type, amount, gross_amount, fee_amount, currency, organizer_id, event_id, payout_id, created_at",
      )
      .eq("transaction_id", txId)
      .order("created_at", { ascending: true }),
    supabase
      .from("platform_fee_entry")
      .select(
        "id, entry_type, ticket_revenue, service_fee, total_customer_payment, processing_cost, net_revenue, fee_rate, currency, created_at",
      )
      .eq("transaction_id", txId)
      .order("created_at", { ascending: true }),
    supabase
      .from("ticket")
      .select("id, ticket_checkout_id, status")
      .eq("transaction_id", txId),
    supabase.rpc("get_transaction_refundable_amount", {
      p_transaction_id: txId,
    }),
  ]);

  const names = await orgNames(
    supabase,
    (ledger ?? []).map((l) => l.organizer_id),
  );

  const checkoutIds = [
    ...new Set(
      (ticketRows ?? [])
        .map((r) => r.ticket_checkout_id as string)
        .filter((x): x is string => !!x),
    ),
  ];
  let checkouts: TransactionDetail["checkouts"] = [];
  if (checkoutIds.length > 0) {
    const { data: tc } = await supabase
      .from("ticket_checkout")
      .select(
        "id, event_id, quantity, total_price, discount, promo_code, status, created_at",
      )
      .in("id", checkoutIds);
    checkouts = (tc ?? []).map((c) => ({
      id: c.id,
      kind: "ticket" as const,
      eventId: c.event_id ?? null,
      quantity: c.quantity ?? null,
      totalPrice: num(c.total_price),
      discount: num(c.discount),
      promoCode: c.promo_code ?? null,
      status: c.status ?? null,
      createdAt: c.created_at ?? new Date(0).toISOString(),
    }));
  }

  return {
    status: 200,
    data: {
      id: t.id,
      status: t.status,
      amount: num(t.amount),
      creditAmount: num(t.credit_amount),
      creditRefundedAmount: num(t.credit_refunded_amount),
      currency: t.currency ?? "",
      reason: t.reason ?? null,
      payerName: t.full_name ?? null,
      payerEmail: canPii ? (t.email ?? null) : null,
      payerPhone: canPii ? (t.phone_number ?? null) : null,
      userId: t.user_id ?? null,
      providerReference: t.provider_reference ?? null,
      paymentMethod: t.payment_method ?? null,
      gatewayResponse:
        typeof t.payment_gateway_response === "string"
          ? t.payment_gateway_response
          : t.payment_gateway_response
            ? JSON.stringify(t.payment_gateway_response)
            : null,
      metadata: (t.metadata as Record<string, unknown>) ?? null,
      createdAt: t.created_at,
      refundRequestedAt: t.refund_requested_at ?? null,
      refundableAmount: num(refundable),
      attempts: (attempts ?? []).map((a) => ({
        id: a.id,
        status: a.status,
        provider: a.provider ?? null,
        providerReference: a.provider_reference ?? null,
        amount: num(a.amount),
        currency: a.currency ?? "",
        failureReason: a.failure_reason ?? null,
        paidAt: a.paid_at ?? null,
        verifiedAt: a.verified_at ?? null,
        createdAt: a.created_at,
      })),
      ledgerEntries: (ledger ?? []).map((l) => ({
        id: l.id,
        entryType: l.entry_type,
        amount: num(l.amount),
        grossAmount: l.gross_amount != null ? num(l.gross_amount) : null,
        feeAmount: l.fee_amount != null ? num(l.fee_amount) : null,
        currency: l.currency ?? "",
        organizerId: l.organizer_id ?? null,
        organizerName: l.organizer_id
          ? (names.get(l.organizer_id) ?? null)
          : null,
        eventId: l.event_id ?? null,
        payoutId: l.payout_id ?? null,
        createdAt: l.created_at,
      })),
      feeEntries: (fees ?? []).map((f) => ({
        id: f.id,
        entryType: f.entry_type,
        ticketRevenue: f.ticket_revenue != null ? num(f.ticket_revenue) : null,
        serviceFee: f.service_fee != null ? num(f.service_fee) : null,
        totalCustomerPayment:
          f.total_customer_payment != null
            ? num(f.total_customer_payment)
            : null,
        processingCost:
          f.processing_cost != null ? num(f.processing_cost) : null,
        netRevenue: f.net_revenue != null ? num(f.net_revenue) : null,
        feeRate: f.fee_rate != null ? num(f.fee_rate) : null,
        currency: f.currency ?? "",
        createdAt: f.created_at,
      })),
      ticketsIssued: (ticketRows ?? []).length,
      checkouts,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Refunds
// ─────────────────────────────────────────────────────────────

export async function listRefundsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: {
    status?: "refund_pending" | "refunded" | "all";
    cursor?: string | null;
  } = {},
): Promise<PaginatedResult<RefundListItem>> {
  try {
    assertPermission(ctx, "finance.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const pageSize = DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("transaction")
    .select(
      "id, status, amount, currency, full_name, provider_reference, refund_requested_at, created_at",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  } else {
    query = query.in("status", REFUND_STATUSES);
  }
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listRefundsCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];
  // One round trip for the whole page: the RPC evaluates the same
  // get_transaction_refundable_amount() per id inside a single statement.
  // A failure here is a 500, not a page of "GH₵0.00" that reads as "nothing
  // to refund".
  const { data: amounts, error: amountsError } = await supabase.rpc(
    "admin_transaction_refundable_amounts",
    { p_transaction_ids: rows.map((r) => r.id) },
  );
  if (amountsError) {
    logger.error(`listRefundsCore refundable failed: ${amountsError.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Couldn't work out the refundable amounts.",
    };
  }
  const refundableById = new Map<string, number>(
    (amounts ?? []).map((a) => [a.transaction_id, num(a.refundable)]),
  );

  const mapped: RefundListItem[] = rows.map((r) => ({
    transactionId: r.id,
    status: r.status,
    amount: num(r.amount),
    currency: r.currency ?? "",
    payerName: r.full_name ?? null,
    providerReference: r.provider_reference ?? null,
    refundRequestedAt: r.refund_requested_at ?? null,
    refundableAmount: refundableById.get(r.id) ?? 0,
    createdAt: r.created_at,
  }));

  const { page, hasNextPage } = splitPage(mapped, pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.createdAt),
          id: last.transactionId,
        })
      : null;
  return { status: 200, data: page, nextCursor, hasNextPage };
}

// ─────────────────────────────────────────────────────────────
// Payouts
// ─────────────────────────────────────────────────────────────

function accountLabel(a: {
  account_type?: string | null;
  provider?: string | null;
  account_number?: string | null;
}): string | null {
  const bits = [a.provider, a.account_type].filter(Boolean).join(" ");
  const masked = a.account_number ? maskAccountNumber(a.account_number) : null;
  return [bits || null, masked].filter(Boolean).join(" · ") || null;
}

function reviewEventsOf(details: unknown): PayoutReviewEvent[] {
  const events = (details as { events?: unknown[] } | null)?.events;
  if (!Array.isArray(events)) return [];
  return events.map((e) => {
    const ev = e as Record<string, unknown>;
    return {
      eventId: String(ev.event_id ?? ""),
      title: String(ev.title ?? ""),
      revenue: num(ev.revenue),
      creditRevenue: num(ev.credit_revenue),
      shareBps: num(ev.share_bps),
    };
  });
}

export async function listPayoutsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filters: { status?: string; cursor?: string | null } = {},
): Promise<PaginatedResult<PayoutListItem>> {
  try {
    assertPermission(ctx, "finance.view");
  } catch (e) {
    return {
      status: 403,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: (e as Error).message,
    };
  }

  const pageSize = DEFAULT_EVENTS_PAGE_SIZE;
  const cursor = decodeCursor<SimpleCursor>(filters.cursor);

  let query = supabase
    .from("payout")
    .select(
      "id, organizer_id, payout_account_id, amount, currency, status, reference, failure_reason, requested_at, processed_at, created_at, review_status, review_details, payout_account(account_type, provider, account_number)",
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (filters.status) query = query.eq("status", filters.status);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.sortValue},and(created_at.eq.${cursor.sortValue},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    logger.error(`listPayoutsCore failed: ${error.message}`);
    return {
      status: 500,
      data: [],
      nextCursor: null,
      hasNextPage: false,
      message: "Something went wrong",
    };
  }

  const rows = data ?? [];
  const names = await orgNames(
    supabase,
    rows.map((r) => r.organizer_id as string),
  );

  const mapped: PayoutListItem[] = rows.map((r) => {
    const acc = r.payout_account as {
      account_type?: string | null;
      provider?: string | null;
      account_number?: string | null;
    } | null;
    return {
      id: r.id as string,
      organizerId: r.organizer_id as string,
      organizerName: names.get(r.organizer_id as string) ?? null,
      amount: num(r.amount),
      currency: (r.currency as string) ?? "",
      status: (r.status as string) ?? "unknown",
      reference: (r.reference as string) ?? null,
      failureReason: (r.failure_reason as string) ?? null,
      accountLabel: acc ? accountLabel(acc) : null,
      requestedAt: (r.requested_at as string) ?? null,
      processedAt: (r.processed_at as string) ?? null,
      createdAt: r.created_at as string,
      reviewStatus:
        (r.review_status as PayoutListItem["reviewStatus"]) ?? "none",
      reviewEvents: reviewEventsOf(r.review_details),
    };
  });

  const { page, hasNextPage } = splitPage(mapped, pageSize);
  const last = page[page.length - 1];
  const nextCursor =
    hasNextPage && last
      ? encodeCursor<SimpleCursor>({
          sortValue: String(last.createdAt),
          id: last.id,
        })
      : null;
  return { status: 200, data: page, nextCursor, hasNextPage };
}

// ─────────────────────────────────────────────────────────────
// Per-organizer finance summary
// ─────────────────────────────────────────────────────────────

export async function getOrganizerFinanceCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  organizerId: string,
): Promise<AdminEnvelope<OrganizerFinanceSummary>> {
  try {
    assertPermission(ctx, "finance.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const [
    { data: balancesRaw, error: balanceError },
    { data: ledger },
    { data: accts },
    { data: payouts },
    names,
  ] = await Promise.all([
    supabase.rpc("admin_organizer_balance", { p_organizer_id: organizerId }),
    supabase
      .from("organizer_ledger_entry")
      .select(
        "id, entry_type, amount, gross_amount, fee_amount, currency, organizer_id, event_id, payout_id, created_at",
      )
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("payout_account")
      .select(
        "id, account_type, provider, account_holder_name, account_number, is_default, status",
      )
      .eq("organizer_id", organizerId),
    supabase
      .from("payout")
      .select(
        "id, organizer_id, payout_account_id, amount, currency, status, reference, failure_reason, requested_at, processed_at, created_at, review_status, review_details, payout_account(account_type, provider, account_number)",
      )
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: false })
      .limit(25),
    orgNames(supabase, [organizerId]),
  ]);

  if (balanceError) {
    logger.error(`getOrganizerFinanceCore failed: ${balanceError.message}`);
    return { status: 500, message: "Couldn't load this organizer's figures." };
  }

  // One row per currency, straight from the ledger rules the organizer's own
  // page and the payout guard use. The primary row drives the headline
  // figures; anything else is reported separately rather than summed across
  // currencies.
  const balances = toOrganizerBalances(balancesRaw);
  const primary = balances[0] ?? null;
  const currency =
    primary?.currency ?? (await getDefaultMarket()).defaultCurrency;

  const ledgerView: LedgerEntryView[] = (ledger ?? [])
    .slice(0, 25)
    .map((l) => ({
      id: l.id,
      entryType: l.entry_type,
      amount: num(l.amount),
      grossAmount: l.gross_amount != null ? num(l.gross_amount) : null,
      feeAmount: l.fee_amount != null ? num(l.fee_amount) : null,
      currency: l.currency ?? currency,
      organizerId: l.organizer_id ?? null,
      organizerName: names.get(organizerId) ?? null,
      eventId: l.event_id ?? null,
      payoutId: l.payout_id ?? null,
      createdAt: l.created_at,
    }));

  const payoutView: PayoutListItem[] = (payouts ?? []).map((r) => {
    const acc = r.payout_account as {
      account_type?: string | null;
      provider?: string | null;
      account_number?: string | null;
    } | null;
    return {
      id: r.id as string,
      organizerId: r.organizer_id as string,
      organizerName: names.get(organizerId) ?? null,
      amount: num(r.amount),
      currency: (r.currency as string) ?? currency,
      status: (r.status as string) ?? "unknown",
      reference: (r.reference as string) ?? null,
      failureReason: (r.failure_reason as string) ?? null,
      accountLabel: acc ? accountLabel(acc) : null,
      requestedAt: (r.requested_at as string) ?? null,
      processedAt: (r.processed_at as string) ?? null,
      createdAt: r.created_at as string,
      reviewStatus:
        (r.review_status as PayoutListItem["reviewStatus"]) ?? "none",
      reviewEvents: reviewEventsOf(r.review_details),
    };
  });

  return {
    status: 200,
    data: {
      organizerId,
      organizerName: names.get(organizerId) ?? null,
      currency,
      earned: primary?.booked ?? 0,
      held: primary?.refundsDeducted ?? 0,
      paidOut: primary?.paidOut ?? 0,
      outstanding: primary ? primary.totalEarnings - primary.paidOut : 0,
      pendingSettlement: primary?.pendingSettlement ?? 0,
      available: primary?.available ?? 0,
      payoutsInFlight: primary?.payoutsInFlight ?? 0,
      payoutsInFlightAmount: primary?.payoutsInFlightAmount ?? 0,
      otherCurrencies: balances.slice(1),
      payoutAccounts: (accts ?? []).map((a) => ({
        id: a.id,
        accountType: a.account_type ?? null,
        provider: a.provider ?? null,
        accountHolderName: a.account_holder_name ?? null,
        maskedNumber: a.account_number
          ? maskAccountNumber(a.account_number)
          : null,
        isDefault: !!a.is_default,
        status: a.status ?? null,
      })),
      recentLedger: ledgerView,
      recentPayouts: payoutView,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Charges with no order (payment_orphan_capture)
// ─────────────────────────────────────────────────────────────

export type OrphanCaptureRow = {
  id: string;
  provider: string;
  countryCode: string;
  providerReference: string;
  amount: number;
  currency: string;
  status: string;
  attemptStatus: string | null;
  note: string | null;
  lastError: string | null;
  detectedAt: string;
  refundRequestedAt: string | null;
  refundedAt: string | null;
};

/**
 * Money a provider captured after Abonten had closed the payment attempt,
 * newest first. Each is refunded automatically (payments/orphanCapture);
 * this is where Finance sees them and any refund that still needs a hand.
 */
export async function listOrphanCapturesCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  limit = 50,
): Promise<AdminEnvelope<OrphanCaptureRow[]>> {
  try {
    assertPermission(ctx, "finance.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }
  const { data, error } = await supabase
    .from("payment_orphan_capture")
    .select(
      "id, provider, country_code, provider_reference, amount, currency, status, attempt_status, note, last_error, detected_at, refund_requested_at, refunded_at",
    )
    .order("detected_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) {
    logger.error(`listOrphanCapturesCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load unmatched charges." };
  }
  return {
    status: 200,
    data: (data ?? []).map((r) => ({
      id: r.id,
      provider: r.provider,
      countryCode: r.country_code,
      providerReference: r.provider_reference,
      amount: num(r.amount),
      currency: r.currency,
      status: r.status,
      attemptStatus: r.attempt_status,
      note: r.note,
      lastError: r.last_error,
      detectedAt: r.detected_at,
      refundRequestedAt: r.refund_requested_at,
      refundedAt: r.refunded_at,
    })),
  };
}
