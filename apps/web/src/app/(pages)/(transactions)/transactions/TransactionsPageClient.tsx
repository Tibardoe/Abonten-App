"use client";

import TransactionsPeriodFilter from "@/components/molecules/TransactionsPeriodFilter";
import TransactionsSummaryCards from "@/components/molecules/TransactionsSummaryCards";
import type { TransactionPeriod } from "@abonten/core/transactionsDateRange";
import type { PaginatedResult } from "@abonten/types/pagination";
import type {
  UserTransactionRow,
  UserTransactionSummaryRow,
} from "@abonten/types/transactions";
import { useState } from "react";
import TransactionsHistoryList from "./TransactionsHistoryList";

type SummaryResult =
  | { status: 200; data: UserTransactionSummaryRow[] }
  | { status: number; message?: string };

export default function TransactionsPageClient({
  initialPeriod,
  initialSummary,
  initialPage,
  hasAnyHistoryEver,
  fetchSummary,
  fetchPage,
}: {
  initialPeriod: TransactionPeriod;
  initialSummary: SummaryResult;
  initialPage: PaginatedResult<UserTransactionRow>;
  hasAnyHistoryEver: boolean;
  fetchSummary: (period: TransactionPeriod) => Promise<SummaryResult>;
  fetchPage: (
    period: TransactionPeriod,
    cursor: string | null,
  ) => Promise<PaginatedResult<UserTransactionRow>>;
}) {
  const [period, setPeriod] = useState<TransactionPeriod>(initialPeriod);

  const emptyState = (
    <div className="m-auto py-10 text-center">
      <p className="text-sm text-muted-foreground">
        {hasAnyHistoryEver
          ? "No transactions for this period."
          : "You have no transactions yet. Purchases and promotions you pay for will show up here."}
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      <TransactionsPeriodFilter value={period} onChange={setPeriod} />

      <TransactionsSummaryCards
        period={period}
        initialPeriod={initialPeriod}
        initialSummary={initialSummary}
        fetchSummary={fetchSummary}
      />

      <TransactionsHistoryList
        queryKey={["user-transactions-history", period]}
        initialPage={period === initialPeriod ? initialPage : null}
        fetchPage={(cursor) => fetchPage(period, cursor)}
        emptyState={emptyState}
      />
    </div>
  );
}
