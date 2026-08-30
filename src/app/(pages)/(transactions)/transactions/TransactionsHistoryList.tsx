"use client";

import TransactionStatusIcon, {
  getTransactionStatusMeta,
} from "@/components/atoms/TransactionStatusIcon";
import TransactionRowSkeleton from "@/components/molecules/TransactionRowSkeleton";
import InfiniteList from "@/components/organisms/InfiniteList";
import type { PaginatedResult } from "@/types/pagination";
import type { UserTransactionRow } from "@/types/transactions";
import { formatSingleDateTime } from "@/utils/dateFormatter";
import { getRefundStatusLabel } from "@/utils/refundStatus";
import Link from "next/link";

// Only meaningful for ticket rows with at least one cancelled ticket —
// summarizes "N of M cancelled" plus the refund outcome for those, without
// implying the whole purchase is cancelled when quantity>1 and only some
// units were.
function getRefundSummary(item: UserTransactionRow) {
  if (
    item.kind !== "ticket" ||
    !item.cancelled_quantity ||
    item.cancelled_quantity <= 0
  ) {
    return null;
  }

  const isFullyCancelled = item.cancelled_quantity === item.quantity;
  const badge = item.refund_status
    ? getRefundStatusLabel(item.refund_status, item.refund_requested_at)
    : null;

  const parts = [
    !isFullyCancelled && item.quantity
      ? `${item.cancelled_quantity} of ${item.quantity} cancelled`
      : null,
    badge?.label ?? null,
  ].filter(Boolean);

  if (parts.length === 0) return null;

  return { text: parts.join(" · "), className: badge?.className };
}

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
        const refundSummary = getRefundSummary(item);

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
              {refundSummary && (
                <p
                  className={`text-xs font-semibold ${refundSummary.className ?? "text-muted-foreground"}`}
                >
                  {refundSummary.text}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 md:gap-3 font-bold">
              <p>
                {/* What the customer actually paid — ticket price + service
                    fee. `total_paid` falls back to `amount` for free/legacy
                    rows where no fee applies. */}
                {item.currency} {item.total_paid ?? item.amount}
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
