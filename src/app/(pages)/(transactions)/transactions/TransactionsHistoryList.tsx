"use client";

import TransactionStatusIcon, {
  getTransactionStatusMeta,
} from "@/components/atoms/TransactionStatusIcon";
import TransactionRowSkeleton from "@/components/molecules/TransactionRowSkeleton";
import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@/types/pagination";
import type { UserTransactionRow } from "@/types/transactions";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import Link from "next/link";

function TransactionsListSkeleton() {
  return (
    <ul>
      {Array.from({ length: 6 }, (_, i) => (
        <TransactionRowSkeleton key={i.toLocaleString()} />
      ))}
    </ul>
  );
}

export default function TransactionsHistoryList({
  queryKey,
  initialPage,
  fetchPage,
  emptyState,
}: {
  queryKey: unknown[];
  initialPage: PaginatedResult<UserTransactionRow> | null;
  fetchPage: (
    cursor: string | null,
  ) => Promise<PaginatedResult<UserTransactionRow>>;
  emptyState: React.ReactNode;
}) {
  return (
    <InfiniteList
      queryKey={queryKey}
      initialPage={initialPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
      loadingSkeleton={<TransactionsListSkeleton />}
      renderItem={(item: UserTransactionRow) => {
        const { date } = formatSingleDateTime(item.created_at);
        const { label: statusLabel } = getTransactionStatusMeta(item.status);
        const title =
          item.title ??
          (item.kind === "subscription" ? "Subscription" : "Ticket Purchase");

        return (
          <Link
            href={`/transactions/${item.kind}/${item.id}`}
            key={item.id}
            className="flex justify-between border-b border-border py-5"
          >
            <div className="space-y-1">
              <h2 className="font-bold">{title}</h2>
              {item.subtitle && (
                <p className="text-sm font-bold text-muted-foreground">
                  {item.subtitle}
                  {item.quantity && item.quantity > 1
                    ? ` x${item.quantity}`
                    : ""}
                </p>
              )}
              <p className="text-sm text-muted-foreground">{date}</p>
            </div>

            <div className="flex items-center gap-2 md:gap-3 font-bold">
              <p>
                {item.currency} {item.amount}
              </p>
              <span className="sr-only">{statusLabel}</span>
              <TransactionStatusIcon status={item.status} />
            </div>
          </Link>
        );
      }}
    />
  );
}
