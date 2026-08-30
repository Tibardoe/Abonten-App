"use client";

import getOrganizerRefundSummary from "@/actions/getOrganizerRefundSummary";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";

/**
 * "Why did my available balance change?" — pending refunds are money
 * already reserved (never counted as available/withdrawable, see
 * request_organizer_payout) the moment a refund is requested, not once
 * it's confirmed; completed refunds are money already returned to
 * attendees. Reads getOrganizerRefundSummary, backed by the same
 * organizer_ledger_entry rows the rest of Finances reads, so this can
 * never disagree with the Available/Pending figures above it.
 */
export default function RefundSummary() {
  const { data, isPending, isError } = useQuery({
    queryKey: ["organizer-refund-summary"],
    queryFn: getOrganizerRefundSummary,
    staleTime: 20_000,
  });

  const rows = data?.status === 200 ? data.data : [];
  const hasRefunds = rows.some(
    (row) => row.pending_refund_amount > 0 || row.completed_refund_amount > 0,
  );

  if (isPending) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  if (isError || !hasRefunds) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-bold md:text-lg">Refunds</h2>
        <p className="text-sm text-muted-foreground">
          Ticket revenue returned or reserved to be returned to attendees —
          never counted as part of your available balance.
        </p>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.currency}
            className="rounded-xl border border-border bg-card text-card-foreground p-4 grid grid-cols-2 gap-4"
          >
            <div>
              <p className="text-sm text-muted-foreground">Pending refunds</p>
              <p className="font-semibold text-lg">
                {row.currency} {row.pending_refund_amount.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed refunds</p>
              <p className="font-semibold text-lg">
                {row.currency} {row.completed_refund_amount.toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
