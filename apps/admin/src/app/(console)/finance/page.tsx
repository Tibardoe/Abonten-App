import { Card, EmptyState, PageHeader, Stat, cn, money } from "@/components/ui";
import { loadFinanceOverview } from "@/lib/data";
import type { DashboardRange } from "@abonten/types/adminTypes";
import Link from "next/link";
import { FinanceTabs } from "./FinanceTabs";

const RANGES: { key: DashboardRange; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
];

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
        description="Reconciliation & investigation. Read-only — admin-initiated refunds and payouts are a later phase."
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
            Range {new Date(res.data.from).toLocaleDateString()} –{" "}
            {new Date(res.data.to).toLocaleDateString()}
            {res.data.activeFeeRate != null
              ? ` · active service fee ${(res.data.activeFeeRate * 100).toFixed(1)}%`
              : ""}
          </p>

          <h3 className="mb-2 mt-3 text-sm font-semibold text-muted-foreground">
            Customer payments
          </h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Total charged"
              value={money(res.data.totalCustomerPayments, res.data.currency)}
              hint={`${res.data.transactionsSuccessful} successful tx`}
            />
            <Stat
              label="Ticket revenue"
              value={money(res.data.ticketRevenue, res.data.currency)}
              hint="paid to organizers"
            />
            <Stat
              label="Service fee revenue"
              value={money(res.data.serviceFeeRevenue, res.data.currency)}
            />
            <Stat
              label="Net platform revenue"
              value={money(res.data.netPlatformRevenue, res.data.currency)}
              hint={`after ${money(res.data.processingCost, res.data.currency)} processing`}
            />
          </div>

          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
            Refunds
          </h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Pending"
              value={res.data.refundsPending}
              hint={money(res.data.refundsPendingAmount, res.data.currency)}
              tone={res.data.refundsPending > 0 ? "warning" : undefined}
              href="/finance/refunds"
            />
            <Stat
              label="Completed"
              value={res.data.refundsCompleted}
              hint={money(res.data.refundsCompletedAmount, res.data.currency)}
            />
          </div>

          <h3 className="mb-2 mt-5 text-sm font-semibold text-muted-foreground">
            Organizer money
          </h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Earnings booked"
              value={money(res.data.organizerEarningsBooked, res.data.currency)}
            />
            <Stat
              label="Held (refund holds)"
              value={money(res.data.organizerEarningsHeld, res.data.currency)}
              tone={res.data.organizerEarningsHeld > 0 ? "warning" : undefined}
            />
            <Stat
              label="Outstanding (payable)"
              value={money(
                res.data.organizerEarningsOutstanding,
                res.data.currency,
              )}
            />
            <Stat
              label="Payouts pending"
              value={res.data.payoutsPending}
              hint={money(res.data.payoutsPendingAmount, res.data.currency)}
              tone={res.data.payoutsPending > 0 ? "warning" : undefined}
              href="/finance/payouts"
            />
          </div>

          <Card className="mt-5 p-3 text-xs text-muted-foreground">
            Customer-payment figures come from the platform_fee_entry ledger,
            organizer figures from organizer_ledger_entry, and refunds from
            transaction status. All live queries — no estimates.
          </Card>
        </>
      )}
    </div>
  );
}
