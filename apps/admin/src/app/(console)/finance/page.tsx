import { MetricCard } from "@/components/metrics/MetricCard";
import { RangeCaption, RangePicker } from "@/components/metrics/RangePicker";
import { SectionHeading } from "@/components/metrics/SectionHeading";
import { Card, EmptyState, PageHeader, money } from "@/components/ui";
import { loadFinanceOverview } from "@/lib/data";
import { computeTrend } from "@abonten/core/admin/computeTrend";
import { FinanceTabs } from "./FinanceTabs";

// Finance answers three questions in order: what did customers pay us, what
// did we give back, and what do we owe organizers. The first two move with
// the selected period; the third is a standing balance, and the page says so
// rather than letting an operator read an all-time figure as this month's.

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const res = await loadFinanceOverview(sp);

  if (res.status !== 200 || !res.data) {
    return (
      <div>
        <PageHeader title="Finance" />
        <FinanceTabs active="/finance" />
        <EmptyState>
          {res.message ?? "Couldn't load the finance figures."}
        </EmptyState>
      </div>
    );
  }

  const f = res.data;
  const { range, current, previous } = f;
  const currency = f.currency;
  const comparison = range.comparisonLabel;
  // One row per currency. The first is the platform's own; anything else is
  // reported separately, never added to it.
  const primary = f.organizerMoney.find((m) => m.currency === currency) ??
    f.organizerMoney[0] ?? {
      currency,
      booked: 0,
      refundsDeducted: 0,
      totalEarnings: 0,
      pendingSettlement: 0,
      available: 0,
      paidOut: 0,
      payoutsInFlight: 0,
      payoutsInFlightAmount: 0,
    };
  const otherCurrencies = f.organizerMoney.filter(
    (m) => m.currency !== primary.currency,
  );
  const stillOwed = primary.totalEarnings - primary.paidOut;

  return (
    <div>
      <PageHeader
        title="Finance"
        description="Reconciliation and investigation. Refunds and payouts are issued from the Transactions and Payouts tabs."
        actions={<RangePicker basePath="/finance" range={range} />}
      />
      <FinanceTabs active="/finance" />
      <RangeCaption range={range} className="mb-3" />
      {f.activeFeeRate != null ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Service fee in force: {(f.activeFeeRate * 100).toFixed(1)}% of the
          ticket price, charged to the customer on top.
        </p>
      ) : null}

      <section className="mb-6">
        <SectionHeading
          title="Customer payments"
          tip={{
            label: "Customer payments",
            text: "What customers paid for tickets in this period, before any refund. Promotions and subscriptions are not included — they have no fee entry.",
          }}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            metric="money.totalCharged"
            value={current.totalCharged}
            format="money"
            currency={currency}
            period={range.label}
            trend={{
              result: computeTrend(current.totalCharged, previous.totalCharged),
              comparisonLabel: comparison,
            }}
            secondary={`${current.paymentsSuccessful} successful payment${current.paymentsSuccessful === 1 ? "" : "s"}`}
          />
          <MetricCard
            metric="money.grossTicketSales"
            value={current.ticketRevenue}
            format="money"
            currency={currency}
            period={range.label}
            trend={{
              result: computeTrend(
                current.ticketRevenue,
                previous.ticketRevenue,
              ),
              comparisonLabel: comparison,
            }}
            secondary={
              current.creditApplied > 0
                ? `${money(current.creditApplied, currency)} of it paid with Abonten Credit`
                : undefined
            }
          />
          <MetricCard
            metric="money.serviceFeeRevenue"
            value={current.serviceFeeRevenue}
            format="money"
            currency={currency}
            period={range.label}
            trend={{
              result: computeTrend(
                current.serviceFeeRevenue,
                previous.serviceFeeRevenue,
              ),
              comparisonLabel: comparison,
            }}
          />
          <MetricCard
            metric="money.netPlatformRevenue"
            value={current.netPlatformRevenue}
            format="money"
            currency={currency}
            period={range.label}
            trend={{
              result: computeTrend(
                current.netPlatformRevenue,
                previous.netPlatformRevenue,
              ),
              comparisonLabel: comparison,
            }}
            secondary={
              current.feeEntries > 0 &&
              current.feeEntriesWithKnownCost < current.feeEntries
                ? `After ${money(current.processingCost, currency)} Paystack cost, known for ${current.feeEntriesWithKnownCost} of ${current.feeEntries} payments`
                : `After ${money(current.processingCost, currency)} Paystack cost`
            }
          />
        </div>
      </section>

      <section className="mb-6">
        <SectionHeading title="Refunds" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            metric="refunds.pendingCount"
            value={f.refundsPending}
            period="Right now"
            tone={f.refundsPending > 0 ? "warning" : undefined}
            secondary={`${money(f.refundsPendingAmount, currency)} still refundable`}
            href="/finance/refunds"
          />
          <MetricCard
            metric="refunds.cashRefunded"
            value={current.cashRefunded}
            format="money"
            currency={currency}
            period={range.label}
            trend={{
              result: computeTrend(current.cashRefunded, previous.cashRefunded),
              comparisonLabel: comparison,
              goodDirection: "down",
            }}
            secondary={`${current.refundsIssued} refund${current.refundsIssued === 1 ? "" : "s"} issued`}
            href="/finance/refunds"
          />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Organizer money"
          tip={{
            label: "Organizer money",
            text: "What Abonten owes organizers, as it stands right now. These are standing balances over all time, not figures for the selected period.",
          }}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricCard
            metric="organizerMoney.booked"
            value={primary.booked}
            format="money"
            currency={primary.currency}
            period="All time"
          />
          <MetricCard
            metric="organizerMoney.deducted"
            value={primary.refundsDeducted}
            format="money"
            currency={primary.currency}
            period="All time"
            tone={primary.refundsDeducted > 0 ? "warning" : undefined}
          />
          <MetricCard
            metric="organizerMoney.paidOut"
            value={primary.paidOut}
            format="money"
            currency={primary.currency}
            period="All time"
          />
          <MetricCard
            metric="organizerMoney.stillOwed"
            value={stillOwed}
            format="money"
            currency={primary.currency}
            period="Right now"
            tone={stillOwed < 0 ? "danger" : undefined}
            secondary={`${money(primary.available, primary.currency)} payable today · ${money(primary.pendingSettlement, primary.currency)} still settling`}
          />
          <MetricCard
            metric="organizerMoney.payoutsInFlight"
            value={primary.payoutsInFlight}
            period="Right now"
            tone={primary.payoutsInFlight > 0 ? "warning" : undefined}
            secondary={`${money(primary.payoutsInFlightAmount, primary.currency)} being processed`}
            href="/finance/payouts"
          />
        </div>

        {otherCurrencies.length > 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Also owed in other currencies, never added to the figures above:{" "}
            {otherCurrencies
              .map((m) => money(m.totalEarnings - m.paidOut, m.currency))
              .join(", ")}
            .
          </p>
        ) : null}

        <Card className="mt-4 p-3 text-xs text-muted-foreground">
          Customer payments and refunds come from the platform fee ledger.
          Organizer money comes from the organizer ledger, using the same rules
          as the organizer&apos;s own Finances page and the payout guard — so
          what shows as payable here is exactly what a payout will allow. An
          organizer&apos;s earnings become payable 48 hours after their event
          ends, which is why &ldquo;still owed&rdquo; is larger than what can be
          paid today. Live queries, no estimates.
        </Card>
      </section>
    </div>
  );
}
