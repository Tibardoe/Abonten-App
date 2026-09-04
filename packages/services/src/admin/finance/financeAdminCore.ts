import { logger } from "@abonten/core/logger";
import { maskAccountNumber } from "@abonten/core/maskAccountNumber";
import {
  DEFAULT_EVENTS_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  splitPage,
} from "@abonten/core/pagination";
import type {
  AdminContext,
  DashboardRange,
  FeeEntryView,
  FinanceOverview,
  LedgerEntryView,
  OrganizerFinanceSummary,
  PayoutListItem,
  RefundListItem,
  TransactionDetail,
  TransactionListItem,
} from "@abonten/types/adminTypes";
import type { PaginatedResult, SimpleCursor } from "@abonten/types/pagination";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type AdminEnvelope, assertPermission } from "../adminContext";

// READ-ONLY Finance ops centre (Phase 3). Reconciliation + investigation
// only — no admin-initiated refund/payout here (that is a later phase and
// gets its own step-up-gated actions). Abonten operates in Ghana
// (Africa/Accra = UTC+0), so UTC day boundaries are local.

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
  supabase: SupabaseClient,
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

export async function getFinanceOverviewCore(
  supabase: SupabaseClient,
  ctx: AdminContext,
  opts: { range: DashboardRange; from?: string; to?: string },
): Promise<AdminEnvelope<FinanceOverview>> {
  try {
    assertPermission(ctx, "finance.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const { from, to } = resolveRange(opts.range, opts.from, opts.to);

  const [
    { data: feeRows },
    { data: txRows },
    { data: earnRows },
    { data: payoutRows },
    { data: cfg },
  ] = await Promise.all([
    supabase
      .from("platform_fee_entry")
      .select(
        "entry_type, ticket_revenue, service_fee, total_customer_payment, processing_cost, net_revenue, currency, created_at",
      )
      .gte("created_at", from)
      .lte("created_at", to)
      .limit(20000),
    supabase
      .from("transaction")
      .select("status, amount, currency, created_at, refund_requested_at")
      .gte("created_at", from)
      .lte("created_at", to)
      .limit(20000),
    supabase
      .from("organizer_ledger_entry")
      .select("entry_type, amount, payout_id, currency")
      .limit(20000),
    supabase.from("payout").select("status, amount, currency").limit(20000),
    supabase
      .from("platform_fee_config")
      .select("fee_rate, currency, is_active")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  let currency = cfg?.currency ?? "GHS";

  let ticketRevenue = 0;
  let serviceFeeRevenue = 0;
  let processingCost = 0;
  let netPlatformRevenue = 0;
  let totalCustomerPayments = 0;
  for (const f of feeRows ?? []) {
    if (f.currency) currency = f.currency;
    ticketRevenue += num(f.ticket_revenue);
    serviceFeeRevenue += num(f.service_fee);
    processingCost += num(f.processing_cost);
    netPlatformRevenue += num(f.net_revenue);
    totalCustomerPayments += num(f.total_customer_payment);
  }

  let transactionsSuccessful = 0;
  let refundsPending = 0;
  let refundsPendingAmount = 0;
  let refundsCompleted = 0;
  let refundsCompletedAmount = 0;
  for (const t of txRows ?? []) {
    if (t.status === "successful") transactionsSuccessful += 1;
    if (t.status === "refund_pending") {
      refundsPending += 1;
      refundsPendingAmount += num(t.amount);
    }
    if (t.status === "refunded") {
      refundsCompleted += 1;
      refundsCompletedAmount += num(t.amount);
    }
  }

  let organizerEarningsBooked = 0;
  let organizerEarningsHeld = 0;
  let organizerEarningsOutstanding = 0;
  for (const l of earnRows ?? []) {
    const a = num(l.amount);
    if (l.entry_type === "earning") {
      organizerEarningsBooked += a;
      if (!l.payout_id) organizerEarningsOutstanding += a;
    } else if (l.entry_type === "refund_hold") {
      // refund_hold rows are stored as NEGATIVE amounts (money withheld from
      // the organizer pending a refund) — track the magnitude withheld.
      organizerEarningsHeld += Math.abs(a);
    }
  }
  // held amounts are not payable until released
  organizerEarningsOutstanding = Math.max(
    0,
    organizerEarningsOutstanding - organizerEarningsHeld,
  );

  let payoutsPending = 0;
  let payoutsPendingAmount = 0;
  for (const p of payoutRows ?? []) {
    if (["requested", "pending", "processing"].includes(String(p.status))) {
      payoutsPending += 1;
      payoutsPendingAmount += num(p.amount);
    }
  }

  return {
    status: 200,
    data: {
      range: opts.range,
      from,
      to,
      currency,
      activeFeeRate: cfg?.fee_rate != null ? num(cfg.fee_rate) : null,
      totalCustomerPayments,
      ticketRevenue,
      serviceFeeRevenue,
      processingCost,
      netPlatformRevenue,
      transactionsSuccessful,
      refundsPending,
      refundsPendingAmount,
      refundsCompleted,
      refundsCompletedAmount,
      organizerEarningsBooked,
      organizerEarningsHeld,
      organizerEarningsOutstanding,
      payoutsPending,
      payoutsPendingAmount,
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
  supabase: SupabaseClient,
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
      "id, status, amount, currency, reason, full_name, email, paystack_reference, payment_method, created_at, refund_requested_at",
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
      `paystack_reference.ilike.%${s}%,email.ilike.%${s}%,full_name.ilike.%${s}%,phone_number.ilike.%${s}%`,
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
    currency: t.currency ?? "GHS",
    reason: t.reason ?? null,
    payerName: t.full_name ?? null,
    payerEmail: canPii ? (t.email ?? null) : null,
    paystackReference: t.paystack_reference ?? null,
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
  supabase: SupabaseClient,
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
      createdAt: c.created_at,
    }));
  }

  return {
    status: 200,
    data: {
      id: t.id,
      status: t.status,
      amount: num(t.amount),
      currency: t.currency ?? "GHS",
      reason: t.reason ?? null,
      payerName: t.full_name ?? null,
      payerEmail: canPii ? (t.email ?? null) : null,
      payerPhone: canPii ? (t.phone_number ?? null) : null,
      userId: t.user_id ?? null,
      paystackReference: t.paystack_reference ?? null,
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
        currency: a.currency ?? "GHS",
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
        currency: l.currency ?? "GHS",
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
        currency: f.currency ?? "GHS",
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
  supabase: SupabaseClient,
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
      "id, status, amount, currency, full_name, paystack_reference, refund_requested_at, created_at",
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
  const refundableById = new Map<string, number>();
  await Promise.all(
    rows.map(async (r) => {
      const { data: amt } = await supabase.rpc(
        "get_transaction_refundable_amount",
        { p_transaction_id: r.id },
      );
      refundableById.set(r.id, num(amt));
    }),
  );

  const mapped: RefundListItem[] = rows.map((r) => ({
    transactionId: r.id,
    status: r.status,
    amount: num(r.amount),
    currency: r.currency ?? "GHS",
    payerName: r.full_name ?? null,
    paystackReference: r.paystack_reference ?? null,
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

export async function listPayoutsCore(
  supabase: SupabaseClient,
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
      "id, organizer_id, payout_account_id, amount, currency, status, reference, failure_reason, requested_at, processed_at, created_at, payout_account(account_type, provider, account_number)",
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
      currency: (r.currency as string) ?? "GHS",
      status: (r.status as string) ?? "unknown",
      reference: (r.reference as string) ?? null,
      failureReason: (r.failure_reason as string) ?? null,
      accountLabel: acc ? accountLabel(acc) : null,
      requestedAt: (r.requested_at as string) ?? null,
      processedAt: (r.processed_at as string) ?? null,
      createdAt: r.created_at as string,
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
  supabase: SupabaseClient,
  ctx: AdminContext,
  organizerId: string,
): Promise<AdminEnvelope<OrganizerFinanceSummary>> {
  try {
    assertPermission(ctx, "finance.view");
  } catch (e) {
    return { status: 403, message: (e as Error).message };
  }

  const [{ data: ledger }, { data: accts }, { data: payouts }, names] =
    await Promise.all([
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
          "id, organizer_id, payout_account_id, amount, currency, status, reference, failure_reason, requested_at, processed_at, created_at, payout_account(account_type, provider, account_number)",
        )
        .eq("organizer_id", organizerId)
        .order("created_at", { ascending: false })
        .limit(25),
      orgNames(supabase, [organizerId]),
    ]);

  let currency = "GHS";
  let earned = 0;
  let held = 0;
  let paidOut = 0;
  for (const l of ledger ?? []) {
    if (l.currency) currency = l.currency;
    const a = num(l.amount);
    if (l.entry_type === "earning") {
      earned += a;
      if (l.payout_id) paidOut += a;
    } else if (l.entry_type === "refund_hold") {
      // stored negative — magnitude withheld
      held += Math.abs(a);
    }
  }
  const outstanding = Math.max(0, earned - paidOut - held);

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
    };
  });

  return {
    status: 200,
    data: {
      organizerId,
      organizerName: names.get(organizerId) ?? null,
      currency,
      earned,
      held,
      paidOut,
      outstanding,
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
