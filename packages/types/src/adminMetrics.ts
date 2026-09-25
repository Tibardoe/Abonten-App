// Payloads of the admin metric RPCs (supabase/migrations/…_admin_*.sql).
//
// The SQL returns snake_case jsonb; the service maps it into these types
// once, so pages never touch a database word.

/**
 * A summary computed from a capped read says how far it got. Null when every
 * row in the period was read; otherwise the page must say the figures are
 * incomplete (apps/admin CapNotice) rather than present a partial sum as
 * the whole.
 */
export type AdminReadTruncation = { fetched: number; total: number };

export type AdminRangeMetrics = {
  newUsers: number;
  newEvents: number;
  newPlaces: number;
  /** Paid tickets issued in the window, excluding cancelled ones. */
  paidTickets: number;
  freeRegistrations: number;
  ticketsCancelled: number;
  /** Organizers who actually sold a ticket in the window. */
  organizersWithSales: number;
  /** Ticket price customers paid, before refunds. */
  grossTicketSales: number;
  /** Ticket price plus service fee, before refunds. */
  totalCharged: number;
  serviceFeeRevenue: number;
  processingCost: number;
  netPlatformRevenue: number;
  /** Sales in the window, and how many of them have a known Paystack cost. */
  feeEntries: number;
  feeEntriesWithKnownCost: number;
  /** Abonten Credit spent on those sales, and how many orders used any. */
  creditApplied: number;
  ordersUsingCredit: number;
  refundsIssued: number;
  /** Cash sent back: ticket price only, the service fee is retained. */
  cashRefunded: number;
  paymentsSuccessful: number;
};

export type AdminSnapshotMetrics = {
  activeUsers: number;
  allAccounts: number;
  organizers: number;
  placeOwners: number;
  eventsPublished: number;
  eventsAll: number;
  places: number;
  refundsPending: number;
  refundsPendingAmount: number;
  /** The currency every money figure here is in (one per report). */
  currency: string;
  /** Currencies with activity: the report can be switched between them. */
  currencies: string[];
};

export type AdminHealthRow = {
  key: string;
  ok: boolean;
  latencyMs: number | null;
  detail: unknown;
  checkedAt: string;
};

export type AdminDashboardKpis = {
  snapshot: AdminSnapshotMetrics;
  current: AdminRangeMetrics;
  previous: AdminRangeMetrics;
  health: AdminHealthRow[];
  needsAttention: Record<string, number>;
};

/** Organizer money for one currency, from admin_organizer_balance(). */
export type AdminOrganizerBalance = {
  currency: string;
  /** Earned from ticket sales before refunds, plus promoter commission. */
  booked: number;
  /** Taken back by refunds, from the moment each refund was requested. */
  refundsDeducted: number;
  /** booked − refundsDeducted: what get_organizer_finance_overview calls total earnings. */
  totalEarnings: number;
  /** Earned but not payable yet: the event settles 48 hours after it ends. */
  pendingSettlement: number;
  /** Payable right now — the figure a payout is checked against. */
  available: number;
  paidOut: number;
  payoutsInFlight: number;
  payoutsInFlightAmount: number;
};

export type AdminFinanceWindow = {
  ticketRevenue: number;
  totalCharged: number;
  serviceFeeRevenue: number;
  processingCost: number;
  netPlatformRevenue: number;
  feeEntries: number;
  feeEntriesWithKnownCost: number;
  creditApplied: number;
  ordersUsingCredit: number;
  refundsIssued: number;
  cashRefunded: number;
  paymentsSuccessful: number;
};

export type AdminFinanceOverview = {
  current: AdminFinanceWindow;
  previous: AdminFinanceWindow;
  refundsPending: number;
  refundsPendingAmount: number;
  organizerMoney: AdminOrganizerBalance[];
  activeFeeRate: number | null;
  currency: string;
  currencies: string[];
};
