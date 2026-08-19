// Row shapes returned by the get_user_transaction_summary/history RPCs
// (supabase/migrations/20260817090000_add_user_transaction_history_analytics.sql).
// Typed precisely (unlike most Supabase-table reads in this repo, which use
// `any` — see PROJECT.md) since these are brand-new, simple, RPC-owned shapes.

export type TransactionKind = "ticket" | "subscription";

export type TransactionStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "expired";

export interface UserTransactionSummaryRow {
  currency: string;
  amount_spent: number;
  total_transactions: number;
  successful_count: number;
  pending_count: number;
  failed_count: number;
  tickets_purchased: number;
  subscriptions_count: number;
}

export interface UserTransactionRow {
  id: string;
  kind: TransactionKind;
  status: TransactionStatus;
  created_at: string;
  completed_at: string | null;
  amount: number;
  currency: string;
  title: string | null;
  subtitle: string | null;
  quantity: number | null;
  reference: string;
  // Ticket rows only — how many of `quantity` tickets from this checkout
  // line are cancelled, and the linked transaction's status for those
  // (every ticket from one checkout line always shares one transaction —
  // see generateTicket.ts). Always null for subscription rows.
  cancelled_quantity: number | null;
  refund_status: string | null;
  // Set once a refund was actually requested from Paystack for the
  // transaction behind these cancelled tickets — null means the refund is
  // deliberately deferred until the rest of the order is cancelled, not
  // that a request failed. See refundStatus.ts.
  refund_requested_at: string | null;
}
