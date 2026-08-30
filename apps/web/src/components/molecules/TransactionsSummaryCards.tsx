"use client";

import StatTile from "@/components/atoms/StatTile";
import TransactionStatusIcon from "@/components/atoms/TransactionStatusIcon";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import StatTilesSkeleton from "@/components/molecules/StatTilesSkeleton";
import type { UserTransactionSummaryRow } from "@/types/transactions";
import type { TransactionPeriod } from "@/utils/transactionsDateRange";
import { useQuery } from "@tanstack/react-query";

type SummaryResult =
  | { status: 200; data: UserTransactionSummaryRow[] }
  | { status: number; message?: string };

export default function TransactionsSummaryCards({
  period,
  initialPeriod,
  initialSummary,
  fetchSummary,
}: {
  period: TransactionPeriod;
  initialPeriod: TransactionPeriod;
  initialSummary: SummaryResult;
  fetchSummary: (period: TransactionPeriod) => Promise<SummaryResult>;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["user-transactions-summary", period],
    queryFn: () => fetchSummary(period),
    initialData: period === initialPeriod ? initialSummary : undefined,
    staleTime: 20_000,
  });

  if (isLoading) {
    return <StatTilesSkeleton count={6} />;
  }

  if (isError || !data || !("data" in data)) {
    return (
      <InlineErrorRetry
        message="We couldn't load your transaction summary."
        onRetry={() => refetch()}
      />
    );
  }

  // The RPC always returns at least one (currency, ...) row, even at zero
  // activity (see get_user_transaction_summary migration comment).
  const row = data.data[0];

  if (!row) {
    return (
      <InlineErrorRetry
        message="We couldn't load your transaction summary."
        onRetry={() => refetch()}
      />
    );
  }

  const otherCurrencyRows = data.data.slice(1);

  const money = (amount: number, currency: string) =>
    `${currency} ${Number(amount).toLocaleString()}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile
          label="Total Transactions"
          value={String(row.total_transactions)}
        />
        <StatTile
          label="Successful"
          value={String(row.successful_count)}
          sublabel={
            row.amount_spent > 0
              ? money(row.amount_spent, row.currency)
              : undefined
          }
          icon={<TransactionStatusIcon status="paid" className="text-base" />}
        />
        <StatTile
          label="Pending"
          value={String(row.pending_count)}
          icon={
            <TransactionStatusIcon status="pending" className="text-base" />
          }
        />
        <StatTile
          label="Failed"
          value={String(row.failed_count)}
          icon={<TransactionStatusIcon status="failed" className="text-base" />}
        />
        <StatTile
          label="Tickets Purchased"
          value={String(row.tickets_purchased)}
        />
        <StatTile
          label="Subscriptions"
          value={String(row.subscriptions_count)}
        />
      </div>

      {otherCurrencyRows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Also spent{" "}
          {otherCurrencyRows
            .map((r: UserTransactionSummaryRow) =>
              money(r.amount_spent, r.currency),
            )
            .join(", ")}
          .
        </p>
      )}
    </div>
  );
}
