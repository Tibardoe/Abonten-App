import { Card, EmptyState, PageHeader, Stat, cn, money } from "@/components/ui";
import { loadFinanceOverview } from "@/lib/data";
import { formatAccraDate } from "@/lib/format";
import type { DashboardRange } from "@abonten/types/adminTypes";
import Link from "next/link";
import { FinanceTabs } from "./FinanceTabs";

const RANGES: { key: DashboardRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
];

const RANGE_LABEL: Record<string, string> = Object.fromEntries(
  RANGES.map((r) => [r.key, r.label]),
);

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const range = (
    RANGES.some((r) => r.key === sp.range) ? sp.range : "30d"
  ) as DashboardRange;
  const res = await loadFinanceOverview(range);

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Reconciliation and investigation. Refunds and payouts are issued from the Transactions and Payouts tabs."
        actions={
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/finance?range=${r.key}`}
                className={cn(
                  "rounded px-2 py-1 text-xs",
                  range === r.key
                    ? "bg-primary text-primary-foreground"
                    : "border border-border hover:bg-muted",
                )}
              >
                {r.label}
              </Link>
            ))}
          </div>
        }
      />

      <FinanceTabs active="/finance" />

      {res.status !== 200 || !res.data ? (
        <EmptyState>
          {res.message ?? "Couldn't load finance overview."}
        </EmptyState>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {RANGE_LABEL[range] ?? range} · {formatAccraDate(res.data.from)} –{" "}
            {formatAccraDate(res.data.to)} · Africa/Accra
            {res.data.activeFeeRate != null
              ? ` · active service fee ${(res.data.activeFeeRate * 100).toFixed(1)}%`
              : ""}
          </p>

          <h3 className="mb-2 mt-3 text-sm font-semibold text-muted-foreground">
            Customer payments · {(RANGE_LABEL[range] ?? range).toLowerCase()}
          </h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Total charged"
              value={money(res.data.totalCustomerPayments, res.data.currency)}
              hint={`${res.data.transactionsSuccessful} successful payment${res.data.transactionsSuccessful === 1 ? "" : "s"} · before refunds`}
            />
            <Stat
              label="Ticket revenue"
              value={money(res.data.ticketRevenue, res.data.currency)}
              hint="owed to organizers · before refunds"
            />
            <Stat
              label="Service fee revenue"
              value={money(res.data.serviceFeeRevenue, res.data.currency)}
              hint="Abonten's share · kept when a ticket is refunded"
            />
            <Stat
              label="Net platform revenue"
              value={money(res.data.netPlatformRevenue, res.data.currency)}
              hint={
                res.data.feeEntriesWithKnownCost === res.data.feeEntries
                  ? `service fee minus ${money(res.data.processingCost, res.data.currency)} Paystack cost`
                  : `service fee minus ${money(res.data.processingCost, res.data.currency)} Paystack cost · cost known for ${res.data.feeEntriesWithKnownCost} of ${res.data.feeEntries} payments`
              }
            />
          </div>

          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
            Refunds
          </h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Awaiting a refund"
              value={res.data.refundsPending}
              hint={`right now · ${money(res.data.refundsPendingAmount, res.data.currency)} still refundable`}
              tone={res.data.refundsPending > 0 ? "warning" : undefined}
              href="/finance/refunds"
            />
            <Stat
              label="Refunds issued"
              value={res.data.refundsCompleted}
              hint={`${(RANGE_LABEL[range] ?? range).toLowerCase()} · ${money(res.data.refundsCompletedAmount, res.data.currency)} sent back`}
            />
          </div>

          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
            Organizer money · all time, right now
          </h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Earnings booked"
              value={money(res.data.organizerEarningsBooked, res.data.currency)}
              hint="ticket sales, less refunds and promoter commission"
            />
            <Stat
              label="Refunds deducted"
              value={money(res.data.organizerEarningsHeld, res.data.currency)}
              tone={res.data.organizerEarningsHeld > 0 ? "warning" : undefined}
              hint="taken off as soon as a refund is requested"
            />
            <Stat
              label="Paid out"
              value={money(
                res.data.organizerEarningsPaidOut,
                res.data.currency,
              )}
              hint="sent to organizers or reserved for a payout"
            />
            <Stat
              label="Still owed"
              value={money(
                res.data.organizerEarningsOutstanding,
                res.data.currency,
              )}
              tone={
                res.data.organizerEarningsOutstanding < 0 ? "danger" : undefined
              }
              hint="booked − held − paid out · not all of it is payable yet"
            />
            <Stat
              label="Payouts in flight"
              value={res.data.payoutsPending}
              hint={`${money(res.data.payoutsPendingAmount, res.data.currency)} being processed`}
              tone={res.data.payoutsPending > 0 ? "warning" : undefined}
              href="/finance/payouts"
            />
          </div>

          <Card className="mt-5 p-3 text-xs text-muted-foreground">
            Customer payments and refunds come from the platform fee ledger;
            organizer money from the organizer ledger — the same entries an
            organizer sees on their own Finances page. Live queries, no
            estimates. An organizer&apos;s earnings only become payable 48 hours
            after their event ends, so &ldquo;still owed&rdquo; is more than
            what can be paid today; open an organizer to see the split.
          </Card>
        </>
      )}
    </div>
  );
}
