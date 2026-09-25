import { MetricCard } from "@/components/metrics/MetricCard";
import { RangeCaption, RangePicker } from "@/components/metrics/RangePicker";
import { SectionHeading } from "@/components/metrics/SectionHeading";
import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { loadDashboard } from "@/lib/data";
import { computeTrend } from "@abonten/core/admin/computeTrend";
import { healthCheckLabel } from "@abonten/core/admin/statusLabels";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

// The dashboard answers two questions, in this order: what needs me right
// now, and how is the platform doing. Everything actionable links to the
// queue that holds the work; every figure says what it counts, the period it
// covers and how that compares with the period before.

const STALE_HEALTH_MS = 15 * 60 * 1000;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const res = await loadDashboard(sp);

  if (res.status !== 200 || !res.data) {
    return (
      <EmptyState>{res.message ?? "Couldn't load the dashboard."}</EmptyState>
    );
  }

  const {
    range,
    snapshot,
    current,
    previous,
    health,
    needsAttention: na,
  } = res.data;
  const currency = snapshot.currency;
  const comparison = range.comparisonLabel;

  const attention: {
    label: string;
    value: number;
    href: string;
    hint: string;
    danger?: boolean;
  }[] = [
    {
      label: "Open reports",
      value: na.openReports,
      href: "/reports",
      hint: "waiting for a decision",
    },
    {
      label: "Urgent reports",
      value: na.urgentReports,
      href: "/reports?priority=urgent",
      hint: "fraud, safety, harassment or impersonation",
      danger: true,
    },
    {
      label: "Unassigned reports",
      value: na.reportsUnassigned,
      href: "/reports?assigned=unassigned",
      hint: "nobody has picked these up",
    },
    {
      label: "Place claims",
      value: na.pendingClaims,
      href: "/claims",
      hint: "businesses waiting to take over a listing",
    },
    {
      label: "Verification requests",
      value: na.pendingVerifications,
      href: "/verification",
      hint: "documents waiting for review",
    },
    {
      label: "Open error groups",
      value: na.openErrorGroups,
      href: "/monitoring",
      hint: "app errors nobody has triaged",
      danger: true,
    },
    {
      label: "Failing health checks",
      value: na.failingHealthChecks,
      href: "/monitoring",
      hint: "dependencies that failed their last probe",
      danger: true,
    },
    {
      label: "Stuck payments",
      value: na.stuckPayments,
      href: "/finance/transactions",
      hint: "unfinished for over 30 minutes",
      danger: true,
    },
    {
      label: "Refunds to issue",
      value: na.pendingRefunds,
      href: "/finance/refunds",
      hint: "requested, money not sent back yet",
    },
    {
      label: "Payouts in flight",
      value: na.pendingPayouts,
      href: "/finance/payouts",
      hint: "being processed right now",
    },
  ];

  const hasAttention = attention.some((a) => a.value > 0);

  return (
    <div>
      <PageHeader
        title="Operations dashboard"
        description="What needs attention right now, and how the platform is doing."
        actions={<RangePicker basePath="/" range={range} />}
      />

      <section className="mb-6">
        <SectionHeading
          title="Needs attention"
          tip={{
            label: "Needs attention",
            text: "Work waiting for a person, counted right now rather than over the selected period. Each tile opens the queue it counts.",
          }}
        />
        {hasAttention ? null : (
          <p className="mb-2 text-xs text-success">
            Nothing is waiting. Every queue below is empty.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {attention.map((a) => (
            <MetricCard
              key={a.label}
              label={a.label}
              value={a.value}
              href={a.href}
              period="Right now"
              stateNote={a.value === 0 ? "Nothing waiting" : undefined}
              definition={{ text: `${a.label}: ${a.hint}.` }}
              tone={a.danger && a.value > 0 ? "danger" : undefined}
            />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <SectionHeading title="Activity" />
        <RangeCaption range={range} className="mb-2" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            metric="tickets.paid"
            value={current.paidTickets}
            period={range.label}
            trend={{
              result: computeTrend(current.paidTickets, previous.paidTickets),
              comparisonLabel: comparison,
            }}
            secondary={
              current.ticketsCancelled > 0
                ? `${current.ticketsCancelled.toLocaleString("en-GB")} later cancelled`
                : undefined
            }
          />
          <MetricCard
            metric="money.grossTicketSales"
            value={current.grossTicketSales}
            format="money"
            currency={currency}
            period={range.label}
            trend={{
              result: computeTrend(
                current.grossTicketSales,
                previous.grossTicketSales,
              ),
              comparisonLabel: comparison,
            }}
            secondary={
              current.ordersUsingCredit > 0
                ? `${current.ordersUsingCredit} order${current.ordersUsingCredit === 1 ? "" : "s"} used Abonten Credit`
                : undefined
            }
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
                ? `Processing cost known for ${current.feeEntriesWithKnownCost} of ${current.feeEntries} payments`
                : undefined
            }
            href="/finance"
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
          <MetricCard
            metric="users.new"
            value={current.newUsers}
            period={range.label}
            trend={{
              result: computeTrend(current.newUsers, previous.newUsers),
              comparisonLabel: comparison,
            }}
          />
          <MetricCard
            metric="tickets.free"
            value={current.freeRegistrations}
            period={range.label}
            trend={{
              result: computeTrend(
                current.freeRegistrations,
                previous.freeRegistrations,
              ),
              comparisonLabel: comparison,
            }}
          />
          <MetricCard
            metric="events.new"
            value={current.newEvents}
            period={range.label}
            trend={{
              result: computeTrend(current.newEvents, previous.newEvents),
              comparisonLabel: comparison,
            }}
            href="/events"
          />
          <MetricCard
            metric="organizers.withNewEvents"
            value={current.organizersWithSales}
            label="Organizers who sold"
            definition={{
              text: "Organizers who sold at least one ticket in this period. It is the number of businesses actually earning on Abonten right now.",
              source:
                "tickets issued in the period, by their event's organizer",
            }}
            period={range.label}
            trend={{
              result: computeTrend(
                current.organizersWithSales,
                previous.organizersWithSales,
              ),
              comparisonLabel: comparison,
            }}
          />
        </div>
      </section>

      <section className="mb-6">
        <SectionHeading
          title="Platform totals"
          tip={{
            label: "Platform totals",
            text: "Everything on Abonten as it stands today. These do not change with the period above.",
          }}
          action={
            <Link
              href="/analytics"
              className="text-xs text-primary hover:underline"
            >
              Trends and demographics →
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            metric="users.active"
            value={snapshot.activeUsers}
            period="Right now"
            secondary={`${snapshot.allAccounts.toLocaleString("en-GB")} accounts including suspended and deleted`}
            href="/users"
          />
          <MetricCard
            metric="organizers.total"
            value={snapshot.organizers}
            period="Right now"
            secondary={`${snapshot.placeOwners.toLocaleString("en-GB")} place owners`}
            href="/organizers"
          />
          <MetricCard
            metric="events.published"
            value={snapshot.eventsPublished}
            period="Right now"
            secondary={`${snapshot.eventsAll.toLocaleString("en-GB")} including drafts and past events`}
            href="/events"
          />
          <MetricCard
            metric="places.total"
            value={snapshot.places}
            period="Right now"
            href="/places"
          />
        </div>
      </section>

      <section>
        <SectionHeading
          title="Dependency health"
          tip="health.dependency"
          action={
            <Link
              href="/monitoring"
              className="text-xs text-primary hover:underline"
            >
              Monitoring →
            </Link>
          }
        />
        {health.length === 0 ? (
          <EmptyState>
            No health checks have run yet. The two-minute probe writes these; if
            this stays empty, the scheduled job cannot reach the web app — see
            Monitoring for how to check it.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {health.map((h) => {
              const checked = h.checkedAt ? new Date(h.checkedAt).getTime() : 0;
              // A probe that stopped reporting used to vanish from this grid;
              // now it stays and says so.
              const stale = Date.now() - checked > STALE_HEALTH_MS;
              return (
                <Card
                  key={h.key}
                  className="flex items-center justify-between gap-2 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {healthCheckLabel(h.key)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {h.latencyMs != null ? `${h.latencyMs}ms · ` : ""}
                      {timeAgo(h.checkedAt)}
                    </p>
                  </div>
                  {stale ? (
                    <Badge tone="warning">
                      <AlertTriangle className="h-3 w-3" /> stale
                    </Badge>
                  ) : h.ok ? (
                    <Badge tone="success">
                      <CheckCircle2 className="h-3 w-3" /> ok
                    </Badge>
                  ) : (
                    <Badge tone="danger">
                      <XCircle className="h-3 w-3" /> down
                    </Badge>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-6 flex items-start gap-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Live figures, read straight from the database when this page loaded —
          nothing here is cached or estimated. Money covers ticket sales only;
          promotions and subscriptions are not included, see{" "}
          <Link href="/finance" className="text-primary hover:underline">
            Finance
          </Link>
          . Every figure is defined in the admin handbook, and behind the ⓘ
          beside it.
        </span>
      </p>
    </div>
  );
}
