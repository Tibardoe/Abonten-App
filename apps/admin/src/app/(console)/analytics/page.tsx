import {
  Card,
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  cn,
  money,
} from "@/components/ui";
import { loadAnalytics } from "@/lib/data";
import { formatAccraDate } from "@/lib/format";
import type {
  AnalyticsSeriesPoint,
  DashboardRange,
} from "@abonten/types/adminTypes";
import Link from "next/link";

const RANGES: { key: DashboardRange; label: string }[] = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
];

const RANGE_LABEL: Record<string, string> = Object.fromEntries(
  RANGES.map((r) => [r.key, r.label]),
);

const SERIES_METRICS: {
  key: keyof Omit<AnalyticsSeriesPoint, "date">;
  label: string;
  money?: boolean;
}[] = [
  { key: "newUsers", label: "New users" },
  { key: "newEvents", label: "New events" },
  { key: "newPlaces", label: "New places" },
  { key: "ticketsIssued", label: "Tickets issued" },
  { key: "grossTicketSales", label: "Gross ticket sales", money: true },
];

function Bars({
  series,
  metric,
  currency,
}: {
  series: AnalyticsSeriesPoint[];
  metric: (typeof SERIES_METRICS)[number];
  currency: string;
}) {
  const max = Math.max(1, ...series.map((p) => Number(p[metric.key])));
  return (
    <Card className="p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {metric.label}
      </p>
      <div className="flex h-24 items-end gap-[2px] overflow-x-auto">
        {series.map((p) => {
          const v = Number(p[metric.key]);
          return (
            <div
              key={p.date}
              title={`${p.date}: ${metric.money ? money(v, currency) : v}`}
              className="w-2 shrink-0 rounded-t bg-primary/70"
              style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
            />
          );
        })}
      </div>
      <p className="mt-1 text-right text-[10px] text-muted-foreground">
        peak {metric.money ? money(max, currency) : max}
      </p>
    </Card>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const range = (
    RANGES.some((r) => r.key === sp.range) ? sp.range : "30d"
  ) as DashboardRange;
  const res = await loadAnalytics(range);

  if (res.status !== 200 || !res.data) {
    return <EmptyState>{res.message ?? "Couldn't load analytics."}</EmptyState>;
  }
  const a = res.data;

  return (
    <div>
      <PageHeader
        title="Platform Analytics"
        description="Growth and ticket-sales trends, live over the selected window. Money figures cover ticket sales only."
        actions={
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/analytics?range=${r.key}`}
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

      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
        All time
      </h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          label="Active users"
          value={a.totals.users.toLocaleString()}
          hint="excludes suspended, banned and deleted accounts"
        />
        <Stat
          label="Organizers"
          value={a.totals.organizers.toLocaleString()}
          hint="published or cancelled at least one event"
        />
        <Stat
          label="Events"
          value={a.totals.eventsPublished.toLocaleString()}
          hint={`published · ${a.totals.eventsTotal.toLocaleString()} incl. drafts`}
        />
        <Stat label="Places" value={a.totals.places.toLocaleString()} />
        <Stat
          label="Tickets issued"
          value={a.totals.ticketsIssuedAllTime.toLocaleString()}
          hint="paid and free, excluding cancelled"
        />
        <Stat
          label="Gross ticket sales"
          value={money(a.totals.grossTicketSalesAllTime, a.currency)}
          hint="ticket price only, before refunds"
        />
        <Stat
          label="Net platform revenue"
          value={money(a.totals.netPlatformRevenueAllTime, a.currency)}
          hint="service fee minus Paystack cost, where the cost is known"
        />
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-muted-foreground">
        {RANGE_LABEL[range] ?? range} · {formatAccraDate(a.from)} –{" "}
        {formatAccraDate(a.to)} · Africa/Accra
      </h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="New users" value={a.inRange.newUsers.toLocaleString()} />
        <Stat label="New events" value={a.inRange.newEvents.toLocaleString()} />
        <Stat label="New places" value={a.inRange.newPlaces.toLocaleString()} />
        <Stat
          label="Organizers who added an event"
          value={a.inRange.organizersWithNewEvents.toLocaleString()}
        />
        <Stat
          label="Tickets issued"
          value={a.inRange.ticketsIssued.toLocaleString()}
          hint="paid and free, excluding cancelled"
        />
        <Stat
          label="Gross ticket sales"
          value={money(a.inRange.grossTicketSales, a.currency)}
          hint="ticket price only, before refunds"
        />
        <Stat
          label="Net platform revenue"
          value={money(a.inRange.netPlatformRevenue, a.currency)}
          hint="service fee minus Paystack cost"
        />
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-muted-foreground">
        Daily trend
      </h3>
      {a.series.length === 0 ? (
        <EmptyState>No activity in this window.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SERIES_METRICS.map((m) => (
            <Bars
              key={m.key}
              series={a.series}
              metric={m}
              currency={a.currency}
            />
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Top events · tickets issued in range
          </h3>
          {a.topEvents.length === 0 ? (
            <EmptyState>No ticketed events in this window.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>Organizer</Th>
                  <Th>Tickets</Th>
                </tr>
              </thead>
              <tbody>
                {a.topEvents.map((e) => (
                  <tr key={e.id} className="hover:bg-muted/40">
                    <Td>
                      <Link
                        href={`/events/${e.id}`}
                        className="text-primary hover:underline"
                      >
                        {e.title}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">
                      {e.organizerName ?? "—"}
                    </Td>
                    <Td className="tabular-nums">{e.ticketsIssued}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
            Top organizers · gross ticket sales in range
          </h3>
          {a.topOrganizers.length === 0 ? (
            <EmptyState>No organizer revenue in this window.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Organizer</Th>
                  <Th>Gross ticket sales</Th>
                </tr>
              </thead>
              <tbody>
                {a.topOrganizers.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/40">
                    <Td>
                      <Link
                        href={`/finance/organizers/${o.id}`}
                        className="text-primary hover:underline"
                      >
                        {o.name ?? `${o.id.slice(0, 8)}…`}
                      </Link>
                    </Td>
                    <Td className="tabular-nums">
                      {money(o.grossTicketSales, o.currency)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
