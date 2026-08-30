export type OrganizerFinanceOverviewRow = {
  currency: string;
  pending_balance: number;
  available_balance: number;
  total_earnings: number;
};

export type OrganizerPendingEarningRow = {
  event_id: string;
  event_title: string;
  currency: string;
  amount: number;
};

export type OrganizerRefundSummaryRow = {
  currency: string;
  refund_request_count: number;
  pending_refund_amount: number;
  completed_refund_amount: number;
};

export type OrganizerLedgerTransactionLine =
  | "ticket_sale"
  | "platform_fee"
  | "refund"
  | "refund_release"
  | "payout"
  | "payout_release";

export type OrganizerLedgerTransactionRow = {
  entry_id: string;
  line: OrganizerLedgerTransactionLine;
  event_id: string | null;
  event_title: string | null;
  amount: number;
  currency: string;
  status: string;
  reference: string | null;
  created_at: string;
};

export type PayoutStatus = "processing" | "completed" | "failed" | "cancelled";

export type OrganizerPayoutRow = {
  id: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  reference: string;
  requested_at: string;
  processed_at: string | null;
};

export type PayoutAccountType = "mobile_money" | "bank";

export type PayoutAccountRow = {
  id: string;
  account_type: PayoutAccountType;
  account_holder_name: string;
  provider: string | null;
  account_number: string;
  is_default: boolean;
  created_at: string;
};

export type OrganizerPayoutDetail = {
  id: string;
  amount: number;
  currency: string;
  status: PayoutStatus;
  reference: string;
  failure_reason: string | null;
  requested_at: string;
  processed_at: string | null;
  payout_account: {
    account_type: PayoutAccountType;
    account_holder_name: string;
    provider: string | null;
    account_number: string;
  } | null;
};
