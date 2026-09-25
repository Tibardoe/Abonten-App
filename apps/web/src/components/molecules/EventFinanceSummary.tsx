"use client";

import getEventFinanceSummary from "@/actions/getEventFinanceSummary";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@abonten/core/formatMoney";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
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
export default function EventFinanceSummary({
  eventId,
  period,
  startDate,
  endDate,
}: {
  eventId: string;
  period: DashboardPeriod;
  startDate: string | null;
  endDate: string | null;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["event-finance-summary", eventId, period],
    queryFn: () => getEventFinanceSummary(eventId, startDate, endDate),
    staleTime: 20_000,
  });

  const summary = data?.status === 200 ? data.data : null;

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }

  if (isError) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-lg">Event Revenue</h2>
        <InlineErrorRetry
          message="We couldn't load this event's revenue."
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-lg">Event Revenue</h2>
        <p className="text-sm text-muted-foreground">
          No revenue data available yet.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">Event Revenue</h2>

      <div className="rounded-xl border border-border bg-card text-card-foreground p-4 space-y-3">
        <Row
          label="Ticket sales"
          value={formatMoney(summary.currency, summary.ticketSales)}
        />
        {/* Under the customer-paid-service-fee model the organizer keeps
            100% of the ticket price, so there is no fee to deduct here.
            Older sales that did carry a 2% deduction still show this row. */}
        {summary.platformFee !== 0 && (
          <Row
            label="Abonten fees"
            value={`-${formatMoney(summary.currency, summary.platformFee)}`}
          />
        )}
        {summary.refunds !== 0 && (
          <div className="space-y-1">
            <Row
              label="Refunds"
              value={`-${formatMoney(summary.currency, Math.abs(summary.refunds))}`}
            />
            {(summary.pendingRefunds > 0 || summary.completedRefunds > 0) && (
              <p className="text-xs text-muted-foreground">
                {summary.refundRequestCount} request
                {summary.refundRequestCount === 1 ? "" : "s"} ·{" "}
                {formatMoney(summary.currency, summary.pendingRefunds)} pending
                · {formatMoney(summary.currency, summary.completedRefunds)}{" "}
                completed
              </p>
            )}
          </div>
        )}
        <Row
          label="Net sales"
          value={formatMoney(summary.currency, summary.netSales)}
        />
        {summary.promoterCommissions !== 0 && (
          <Row
            label="Promoter commissions"
            value={`-${formatMoney(summary.currency, Math.abs(summary.promoterCommissions))}`}
          />
        )}
        <hr className="border-border" />
        <Row
          label="Organizer earnings"
          value={formatMoney(summary.currency, summary.organizerEarnings)}
        />

        <hr className="border-border" />

        {period !== "all" && (
          <p className="text-xs text-muted-foreground">
            Refund breakdown and settlement status below are all-time, not
            limited to the selected period.
          </p>
        )}

        {summary.settled ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">Settlement status: Settled</p>
            <p className="text-xs text-muted-foreground">
              {formatMoney(summary.currency, summary.organizerEarnings)} is now
              available in your Finances balance.
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
