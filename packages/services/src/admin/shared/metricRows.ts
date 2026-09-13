import type {
  AdminHealthRow,
  AdminRangeMetrics,
  AdminSnapshotMetrics,
} from "@abonten/types/adminMetrics";

// The one place a database word becomes an application one. The metric RPCs
// return jsonb built in SQL (snake_case, numerics as strings); these mappers
// turn that into the typed shapes the console renders, and give a missing
// key a defined value rather than letting `undefined` reach a tile.

export function num(v: unknown): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

type Row = Record<string, unknown>;

export function toRangeMetrics(raw: unknown): AdminRangeMetrics {
  const r = (raw ?? {}) as Row;
  return {
    newUsers: num(r.new_users),
    newEvents: num(r.new_events),
    newPlaces: num(r.new_places),
    paidTickets: num(r.paid_tickets),
    freeRegistrations: num(r.free_registrations),
    ticketsCancelled: num(r.tickets_cancelled),
    organizersWithSales: num(r.organizers_with_sales),
    grossTicketSales: num(r.gross_ticket_sales),
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

export function toSnapshotMetrics(raw: unknown): AdminSnapshotMetrics {
  const r = (raw ?? {}) as Row;
  return {
    activeUsers: num(r.activeUsers),
    allAccounts: num(r.allAccounts),
    organizers: num(r.organizers),
    placeOwners: num(r.placeOwners),
    eventsPublished: num(r.eventsPublished),
    eventsAll: num(r.eventsAll),
    places: num(r.places),
    refundsPending: num(r.refundsPending),
    refundsPendingAmount: num(r.refundsPendingAmount),
    currency: typeof r.currency === "string" ? r.currency : "GHS",
  };
}

export function toHealthRows(raw: unknown): AdminHealthRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = (row ?? {}) as Row;
    return {
      key: String(r.key ?? ""),
      ok: r.ok === true,
      latencyMs: r.latencyMs == null ? null : num(r.latencyMs),
      detail: r.detail ?? null,
      checkedAt: String(r.checkedAt ?? ""),
    };
  });
}
