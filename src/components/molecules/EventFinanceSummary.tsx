"use client";

import getEventFinanceSummary from "@/actions/getEventFinanceSummary";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/**
 * An individual event's contribution to the organizer's Finances balance —
 * reads getEventFinanceSummary, which reads the same organizer_ledger_entry
 * rows Finances itself reads, so this can never disagree with the Finances
 * page. Deliberately has no Withdraw button here — the main withdrawal
 * action lives only in Finances > Overview.
 */
export default function EventFinanceSummary({ eventId }: { eventId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["event-finance-summary", eventId],
    queryFn: () => getEventFinanceSummary(eventId),
    staleTime: 20_000,
  });

  const summary = data?.status === 200 ? data.data : null;

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  if (!summary) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">Event Revenue</h2>

      <div className="rounded-xl border border-border bg-card text-card-foreground p-4 space-y-3">
        <Row
          label="Ticket sales"
          value={`${summary.currency} ${summary.ticketSales.toLocaleString()}`}
        />
        <Row
          label="Abonten fees"
          value={`-${summary.currency} ${summary.platformFee.toLocaleString()}`}
        />
        {summary.refunds !== 0 && (
          <div className="space-y-1">
            <Row
              label="Refunds"
              value={`-${summary.currency} ${Math.abs(summary.refunds).toLocaleString()}`}
            />
            {(summary.pendingRefunds > 0 || summary.completedRefunds > 0) && (
              <p className="text-xs text-muted-foreground">
                {summary.refundRequestCount} request
                {summary.refundRequestCount === 1 ? "" : "s"} ·{" "}
                {summary.currency} {summary.pendingRefunds.toLocaleString()}{" "}
                pending · {summary.currency}{" "}
                {summary.completedRefunds.toLocaleString()} completed
              </p>
            )}
          </div>
        )}
        <Row
          label="Net sales"
          value={`${summary.currency} ${summary.netSales.toLocaleString()}`}
        />
        <hr className="border-border" />
        <Row
          label="Organizer earnings"
          value={`${summary.currency} ${summary.organizerEarnings.toLocaleString()}`}
        />

        <hr className="border-border" />

        {summary.settled ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">Settlement status: Settled</p>
            <p className="text-xs text-muted-foreground">
              {summary.currency} {summary.organizerEarnings.toLocaleString()} is
              now available in your Finances balance.
            </p>
            <Link
              href="/finances"
              className="text-xs font-medium text-primary hover:underline"
            >
              View Finances
            </Link>
          </div>
        ) : (
          <p className="text-sm font-medium">
            Settlement status: Pending settlement
          </p>
        )}
      </div>
    </section>
  );
}
