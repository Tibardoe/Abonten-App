"use client";

import StatTile from "@/components/atoms/StatTile";
import TransactionStatusIcon from "@/components/atoms/TransactionStatusIcon";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import StatTilesSkeleton from "@/components/molecules/StatTilesSkeleton";
import { formatMoney } from "@abonten/core/formatMoney";
import type { TransactionPeriod } from "@abonten/core/transactionsDateRange";
import type { UserTransactionSummaryRow } from "@abonten/types/transactions";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("common");

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
        message={t("weCouldnTLoadYourTransaction")}
        onRetry={() => refetch()}
      />
    );
  }

  // The RPC returns at least one (currency, ...) row, even at zero activity
  // (migration 20260927015944 restored that after a 2026-09-24 regression).
  // An empty answer still means "nothing yet", never a failure.
  const row: UserTransactionSummaryRow = data.data[0] ?? {
    currency: "",
    amount_spent: 0,
    total_transactions: 0,
    successful_count: 0,
    pending_count: 0,
    failed_count: 0,
    tickets_purchased: 0,
    subscriptions_count: 0,
  };

  const otherCurrencyRows = data.data.slice(1);

  const money = (amount: number, currency: string) =>
    formatMoney(currency, Number(amount));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile
          label={t("totalTransactions")}
          value={String(row.total_transactions)}
        />
        <StatTile
          label={t("successful")}
          value={String(row.successful_count)}
          sublabel={
            row.amount_spent > 0
              ? money(row.amount_spent, row.currency)
              : undefined
          }
          icon={<TransactionStatusIcon status="paid" className="text-base" />}
        />
        <StatTile
          label={t("pending")}
          value={String(row.pending_count)}
          icon={
            <TransactionStatusIcon status="pending" className="text-base" />
          }
        />
        <StatTile
          label={t("failed")}
          value={String(row.failed_count)}
          icon={<TransactionStatusIcon status="failed" className="text-base" />}
        />
        <StatTile
          label={t("ticketsPurchased")}
          value={String(row.tickets_purchased)}
        />
        <StatTile
          label={t("subscriptions")}
          value={String(row.subscriptions_count)}
        />
      </div>

      {otherCurrencyRows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("alsoSpent", {
            join: otherCurrencyRows
              .map((r: UserTransactionSummaryRow) =>
                money(r.amount_spent, r.currency),
              )
              .join(", "),
          })}
        </p>
      )}
    </div>
  );
}
