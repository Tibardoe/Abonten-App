// Payloads of the admin metric RPCs (supabase/migrations/…_admin_*.sql).
//
// The SQL returns snake_case jsonb; the service maps it into these types
// once, so pages never touch a database word.

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
  currency: string;
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
