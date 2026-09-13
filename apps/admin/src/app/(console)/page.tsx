import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  money,
  timeAgo,
} from "@/components/ui";
import { loadDashboard } from "@/lib/data";
import { formatAccraDate } from "@/lib/format";
import type { DashboardRange } from "@abonten/types/adminTypes";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

const RANGES: DashboardRange[] = ["today", "yesterday", "7d", "30d", "90d"];

const RANGE_LABEL: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = (
    RANGES.includes(sp.range as DashboardRange) ? sp.range : "30d"
  ) as DashboardRange;
  const res = await loadDashboard(range);

  if (res.status !== 200 || !res.data) {
    return (
      <EmptyState>{res.message ?? "Couldn't load the dashboard."}</EmptyState>
    );
  }
  const { kpis, health, needsAttention: na } = res.data;
  const rangeLabel = RANGE_LABEL[range] ?? range;
  const rangeHint = rangeLabel.toLowerCase();

  const attention: {
    label: string;
    value: number;
    href: string;
    danger?: boolean;
  }[] = [
    { label: "Open reports", value: na.openReports, href: "/reports" },
    {
      label: "Urgent reports",
      value: na.urgentReports,
      href: "/reports?priority=urgent",
      danger: na.urgentReports > 0,
    },
    {
      label: "Unassigned reports",
      value: na.reportsUnassigned,
      href: "/reports?assigned=unassigned",
    },
    {
      label: "Pending place claims",
      value: na.pendingClaims,
      href: "/claims",
    },
    {
      label: "Pending verifications",
      value: na.pendingVerifications,
      href: "/verification",
    },
    {
      label: "Open error groups",
      value: na.openErrorGroups,
      href: "/monitoring",
      danger: na.openErrorGroups > 0,
    },
    {
      label: "Failing health checks",
      value: na.failingHealthChecks,
      href: "/monitoring",
      danger: na.failingHealthChecks > 0,
    },
    {
      label: "Stuck payments (>30m)",
      value: na.stuckPayments,
      href: "/monitoring",
      danger: na.stuckPayments > 0,
    },
    {
      label: "Refunds pending",
      value: na.pendingRefunds,
      href: "/finance/refunds",
    },
    {
      label: "Payouts pending",
      value: na.pendingPayouts,
      href: "/finance/payouts",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Operations Dashboard"
        description={`${rangeLabel} · ${formatAccraDate(res.data.from)} – ${formatAccraDate(res.data.to)} · Africa/Accra`}
        actions={
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/?range=${r}`}
                className={`rounded px-2 py-1 text-xs ${r === range ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}
              >
                {RANGE_LABEL[r] ?? r}
              </Link>
            ))}
          </div>
        }
      />

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Needs attention
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {attention.map((a) => (
            <Stat
              key={a.label}
              label={a.label}
              value={a.value}
              href={a.href}
              tone={a.danger && a.value > 0 ? "danger" : undefined}
            />
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Platform overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat
            label="Active users"
            value={kpis.totalUsers.toLocaleString()}
            hint={`all time · ${kpis.allAccounts.toLocaleString()} accounts incl. suspended and deleted`}
          />
          <Stat
            label="New users"
            value={kpis.newUsers.toLocaleString()}
            hint={rangeHint}
          />
          <Stat
            label="Organizers"
            value={kpis.organizers.toLocaleString()}
            hint="all time · published or cancelled an event"
          />
          <Stat
            label="Events"
            value={kpis.eventsPublished.toLocaleString()}
            hint={`published · ${kpis.events.toLocaleString()} incl. drafts`}
          />
          <Stat
            label="Places"
            value={kpis.places.toLocaleString()}
            hint="all time"
          />
          <Stat
            label="Tickets sold"
            value={kpis.ticketsSold.toLocaleString()}
            hint={`${rangeHint} · paid, excluding cancelled`}
          />
          <Stat
            label="Free registrations"
            value={kpis.freeRegistrations.toLocaleString()}
            hint={`${rangeHint} · excluding cancelled`}
          />
          <Stat
            label="Gross ticket sales"
            value={money(kpis.grossTicketSales, kpis.currency)}
            hint={`${rangeHint} · before refunds`}
          />
          <Stat
            label="Service fee revenue"
            value={money(kpis.platformFeeRevenue, kpis.currency)}
            hint={`${rangeHint} · kept even when a ticket is refunded`}
          />
          <Stat
            label="Cash refunded"
            value={money(kpis.refunds, kpis.currency)}
            hint={`${rangeHint} · ${kpis.refundsCount} refund${kpis.refundsCount === 1 ? "" : "s"} issued, ticket price only`}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
          Dependency health
        </h2>
        {health.length === 0 ? (
          <EmptyState>
            No health checks recorded yet. The{" "}
            <code>/api/observability/health</code> cron hasn&apos;t run — see
            the monitoring setup notes.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {health.map((h) => (
              <Card
                key={h.key}
                className="flex items-center justify-between p-3"
              >
                <div>
                  <p className="font-medium capitalize">{h.key}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.latencyMs != null ? `${h.latencyMs}ms · ` : ""}
                    {timeAgo(h.checkedAt)}
                  </p>
                </div>
                {h.ok ? (
                  <Badge tone="success">
                    <CheckCircle2 className="h-3 w-3" /> ok
                  </Badge>
                ) : (
                  <Badge tone="danger">
                    <XCircle className="h-3 w-3" /> down
                  </Badge>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 flex items-start gap-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Live figures read straight from the production database; health rows
          come from real dependency probes. Money figures count ticket sales
          only — promotions and subscriptions are not included. See{" "}
          <Link href="/analytics" className="text-primary hover:underline">
            Analytics
          </Link>{" "}
          for trends and{" "}
          <Link href="/finance" className="text-primary hover:underline">
            Finance
          </Link>{" "}
          for the full money picture.
        </span>
      </p>
    </div>
  );
}
