import { ChartCard } from "@/components/metrics/ChartCard";
import { MetricCard } from "@/components/metrics/MetricCard";
import { RangeCaption, RangePicker } from "@/components/metrics/RangePicker";
import { SectionHeading } from "@/components/metrics/SectionHeading";
import { BreakdownBars } from "@/components/metrics/charts/BreakdownBars";
import { TimeSeriesChart } from "@/components/metrics/charts/TimeSeriesChart";
import {
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  money,
} from "@/components/ui";
import { loadAnalytics } from "@/lib/data";
import { formatAccraDate } from "@/lib/format";
import { computeTrend } from "@abonten/core/admin/computeTrend";
import { describeSeries } from "@abonten/core/admin/describeSeries";
import { statusMeta } from "@abonten/core/admin/statusLabels";
import Link from "next/link";

// Analytics answers "how is Abonten growing, and who is using it" — with
// every figure defined, every period stated, and nothing shown that the data
// cannot honestly support.

const SIGN_IN_LABELS: Record<string, string> = {
  google: "Google",
  phone: "Phone number",
  email: "Email",
  unknown: "Not recorded",
};

const ROLE_LABELS: Record<string, string> = {
  organizer: "Organizers",
  placeOwner: "Place owners",
  buyer: "Buyers only",
  noActivity: "No activity yet",
};

const PLATFORM_LABELS: Record<string, string> = {
  android: "Android",
  ios: "iPhone and iPad",
  web: "Web",
};

function bucketLabel(iso: string, bucket: "hour" | "day" | "week"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (bucket === "hour") {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Accra",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    day: "numeric",
    month: "short",
  }).format(d);
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const res = await loadAnalytics(sp);

  if (res.status !== 200 || !res.data) {
    return <EmptyState>{res.message ?? "Couldn't load analytics."}</EmptyState>;
  }

  const a = res.data;
  const { range, current, previous, snapshot, demographics: demo } = a;
  const currency = snapshot.currency;
  const comparison = range.comparisonLabel;
  const label = (iso: string) => bucketLabel(iso, a.bucket);

  // Charts: one series, its previous-period twin aligned by position (the
  // windows are the same length), and an honest empty state.
  const chart = (
    key: "newUsers" | "paidTickets" | "grossTicketSales" | "cashRefunded",
  ) =>
    a.series.map((row, i) => ({
      label: label(row.bucketStart),
      value: row[key],
      previous:
        key === "cashRefunded"
          ? null
          : (a.previousSeries[i]?.[
              key as "newUsers" | "paidTickets" | "grossTicketSales"
            ] ?? null),
    }));

  const asMoney = (v: number) => money(v, currency);
  const seriesState = (total: number) =>
    a.series.length === 0 ? "empty" : total === 0 ? "empty" : "ok";

  const tableFor = (
    caption: string,
    valueHeader: string,
    key: "newUsers" | "paidTickets" | "grossTicketSales" | "cashRefunded",
    format?: (v: number) => string,
  ) => ({
    caption,
    columns: ["Period", valueHeader],
    rows: a.series.map((row) => [
      label(row.bucketStart),
      format ? format(row[key]) : row[key],
    ]) as (string | number)[][],
  });

  const bucketWord =
    a.bucket === "hour" ? "hour" : a.bucket === "week" ? "week" : "day";

  return (
    <div>
      <PageHeader
        title="Platform analytics"
        description="How Abonten is growing, what it sells, and who uses it. Money figures cover ticket sales only."
        actions={<RangePicker basePath="/analytics" range={range} />}
      />
      <RangeCaption range={range} className="mb-4" />

      <section className="mb-6">
        <SectionHeading title="In this period" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
            metric="tickets.paid"
            value={current.paidTickets}
            period={range.label}
            trend={{
              result: computeTrend(current.paidTickets, previous.paidTickets),
              comparisonLabel: comparison,
            }}
            secondary={`${current.freeRegistrations.toLocaleString("en-GH")} free registrations`}
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
                ? `Cost known for ${current.feeEntriesWithKnownCost} of ${current.feeEntries} payments`
                : undefined
            }
          />
          <MetricCard
            metric="events.new"
            value={current.newEvents}
            period={range.label}
            trend={{
              result: computeTrend(current.newEvents, previous.newEvents),
              comparisonLabel: comparison,
            }}
          />
          <MetricCard
            metric="places.new"
            value={current.newPlaces}
            period={range.label}
            trend={{
              result: computeTrend(current.newPlaces, previous.newPlaces),
              comparisonLabel: comparison,
            }}
          />
          <MetricCard
            label="Organizers who sold"
            definition={{
              text: "Organizers who sold at least one ticket in this period — the number of businesses actually earning on Abonten.",
              source:
                "tickets issued in the period, by their event's organizer",
            }}
            value={current.organizersWithSales}
            period={range.label}
            trend={{
              result: computeTrend(
                current.organizersWithSales,
                previous.organizersWithSales,
              ),
              comparisonLabel: comparison,
            }}
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
          />
        </div>
      </section>

      <section className="mb-6">
        <SectionHeading title="Over time" />
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartCard
            title="New users"
            unit={`per ${bucketWord}`}
            definition="users.new"
            state={seriesState(current.newUsers)}
            summary={describeSeries(
              a.series.map((r) => ({
                bucketStart: r.bucketStart,
                value: r.newUsers,
              })),
              {
                label: "New users",
                rangeLabel: range.label,
                formatBucket: label,
                previousTotal: previous.newUsers,
              },
            )}
            legend={[
              { label: range.label, swatch: "hsl(var(--chart-1))" },
              ...(comparison
                ? [
                    {
                      label: "Previous period",
                      swatch: "hsl(var(--chart-3))",
                      dashed: true,
                    },
                  ]
                : []),
            ]}
            table={tableFor("New users per period", "New users", "newUsers")}
          >
            <TimeSeriesChart
              data={chart("newUsers")}
              valueLabel="New users"
              previousLabel="Previous period"
            />
          </ChartCard>

          <ChartCard
            title="Tickets sold"
            unit={`per ${bucketWord}`}
            definition="tickets.paid"
            state={seriesState(current.paidTickets)}
            summary={describeSeries(
              a.series.map((r) => ({
                bucketStart: r.bucketStart,
                value: r.paidTickets,
              })),
              {
                label: "Tickets sold",
                rangeLabel: range.label,
                formatBucket: label,
                previousTotal: previous.paidTickets,
              },
            )}
            legend={[
              { label: range.label, swatch: "hsl(var(--chart-1))" },
              ...(comparison
                ? [
                    {
                      label: "Previous period",
                      swatch: "hsl(var(--chart-3))",
                      dashed: true,
                    },
                  ]
                : []),
            ]}
            table={tableFor(
              "Tickets sold per period",
              "Tickets sold",
              "paidTickets",
            )}
          >
            <TimeSeriesChart
              data={chart("paidTickets")}
              valueLabel="Tickets sold"
              previousLabel="Previous period"
            />
          </ChartCard>

          <ChartCard
            title="Gross ticket sales"
            unit={currency}
            definition="money.grossTicketSales"
            state={seriesState(current.grossTicketSales)}
            summary={describeSeries(
              a.series.map((r) => ({
                bucketStart: r.bucketStart,
                value: r.grossTicketSales,
              })),
              {
                label: "Gross ticket sales",
                rangeLabel: range.label,
                format: asMoney,
                formatBucket: label,
                previousTotal: previous.grossTicketSales,
              },
            )}
            legend={[
              { label: range.label, swatch: "hsl(var(--chart-1))" },
              ...(comparison
                ? [
                    {
                      label: "Previous period",
                      swatch: "hsl(var(--chart-3))",
                      dashed: true,
                    },
                  ]
                : []),
            ]}
            table={tableFor(
              "Gross ticket sales per period",
              `Gross ticket sales (${currency})`,
              "grossTicketSales",
              asMoney,
            )}
          >
            <TimeSeriesChart
              data={chart("grossTicketSales")}
              valueLabel="Gross ticket sales"
              previousLabel="Previous period"
              format="money"
              currency={currency}
            />
          </ChartCard>

          <ChartCard
            title="Cash refunded"
            unit={currency}
            definition="refunds.cashRefunded"
            state={seriesState(current.cashRefunded)}
            summary={describeSeries(
              a.series.map((r) => ({
                bucketStart: r.bucketStart,
                value: r.cashRefunded,
              })),
              {
                label: "Cash refunded",
                rangeLabel: range.label,
                format: asMoney,
                formatBucket: label,
                previousTotal: previous.cashRefunded,
              },
            )}
            table={tableFor(
              "Cash refunded per period",
              `Cash refunded (${currency})`,
              "cashRefunded",
              asMoney,
            )}
          >
            <TimeSeriesChart
              data={chart("cashRefunded")}
              valueLabel="Cash refunded"
              format="money"
              currency={currency}
            />
          </ChartCard>
        </div>
      </section>

      <section className="mb-6">
        <SectionHeading
          title="Who uses Abonten"
          tip={{
            label: "Who uses Abonten",
            text: "Aggregate breakdowns only, and only what the platform actually records. Groups too small to show without pointing at individuals are hidden.",
          }}
        />
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            metric="demo.buyers"
            value={demo.buyersAllTime}
            period="All time"
          />
          <MetricCard
            metric="demo.repeatBuyers"
            value={demo.repeatBuyersAllTime}
            period="All time"
            state={demo.repeatBuyerShare === null ? "insufficient" : undefined}
            stateNote={
              demo.repeatBuyerShare === null
                ? "Fewer than five buyers so far"
                : undefined
            }
            secondary={
              demo.repeatBuyerShare !== null
                ? `${Math.round(demo.repeatBuyerShare * 100)}% of buyers`
                : undefined
            }
          />
          <MetricCard
            metric="demo.buyerConversion"
            value={demo.buyerConversion}
            format="percent"
            period="All time"
            state={demo.buyerConversion === null ? "insufficient" : undefined}
            secondary={`${demo.buyersAllTime.toLocaleString("en-GH")} of ${demo.activeUsers.toLocaleString("en-GH")} active users`}
          />
          <MetricCard
            metric="demo.returningBuyers"
            value={demo.returningBuyerRate}
            format="percent"
            period={range.label}
            state={
              demo.returningBuyerRate === null ? "insufficient" : undefined
            }
            stateNote={
              demo.returningBuyerRate === null
                ? "Too few buyers in the previous period to compare"
                : undefined
            }
            secondary={
              demo.returningBuyerRate !== null
                ? `${demo.returningBuyers} of ${demo.buyersPrevious} came back`
                : undefined
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">What people do here</h3>
            <BreakdownBars
              buckets={demo.roles.buckets}
              total={demo.roles.total}
              labelFor={(k) => ROLE_LABELS[k] ?? k}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Active accounts, each counted once in the widest role they hold.
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">How people sign in</h3>
            <BreakdownBars
              buckets={demo.signInMethod.buckets}
              total={demo.signInMethod.total}
              labelFor={(k) => SIGN_IN_LABELS[k] ?? k}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              The method each account was created with. Deleted accounts are
              left out.
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Mobile platforms</h3>
            <BreakdownBars
              buckets={demo.platform.buckets}
              total={demo.platform.total}
              labelFor={(k) => PLATFORM_LABELS[k] ?? k}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {demo.platformUsersTotal === 0
                ? "Nobody has allowed notifications on a phone yet, so there is nothing to show."
                : `Only the ${demo.platformUsersTotal.toLocaleString("en-GH")} ${
                    demo.platformUsersTotal === 1 ? "person" : "people"
                  } who allowed notifications on a phone, counted once per platform they use. Not a share of all users, and web-only users do not appear.`}
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Account status</h3>
            <BreakdownBars
              buckets={demo.accountStatus.buckets}
              total={demo.accountStatus.total}
              labelFor={(k: string) => statusMeta("userAccount", k).label}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Every account, including the ones that can no longer sign in.
            </p>
          </Card>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Abonten does not collect age, gender, home location or language, and
          keeps no record of when someone was last active — so there are no such
          breakdowns here, and none should be inferred from what is.
        </p>
      </section>

      <section className="mb-6">
        <SectionHeading title="Everything so far" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            metric="users.active"
            value={snapshot.activeUsers}
            period="Right now"
            secondary={`${snapshot.allAccounts.toLocaleString("en-GH")} accounts in total`}
          />
          <MetricCard
            metric="organizers.total"
            value={snapshot.organizers}
            period="Right now"
            secondary={`${snapshot.placeOwners.toLocaleString("en-GH")} place owners`}
          />
          <MetricCard
            metric="events.published"
            value={snapshot.eventsPublished}
            period="Right now"
            secondary={`${snapshot.eventsAll.toLocaleString("en-GH")} including drafts`}
          />
          <MetricCard
            metric="places.total"
            value={snapshot.places}
            period="Right now"
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <SectionHeading title={`Top events · ${range.label.toLowerCase()}`} />
          {a.topEvents.length === 0 ? (
            <EmptyState>No tickets were sold in this period.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Event</Th>
                  <Th>Organizer</Th>
                  <Th>Tickets sold</Th>
                  <Th>Gross sales</Th>
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
                    <Td className="tabular-nums">{e.paidTickets}</Td>
                    <Td className="tabular-nums">
                      {money(e.grossTicketSales, currency)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>

        <div>
          <SectionHeading
            title={`Top organizers · ${range.label.toLowerCase()}`}
          />
          {a.topOrganizers.length === 0 ? (
            <EmptyState>
              Nobody earned from ticket sales in this period.
            </EmptyState>
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
          {a.grossWithoutEvent > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {money(a.grossWithoutEvent, currency)} of sales covered more than
              one event in a single order and cannot be attributed to one
              organizer, so it is missing from this table.
            </p>
          ) : null}
        </div>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Read from the database when this page loaded, for{" "}
        {formatAccraDate(range.from)} onwards. These are operational figures,
        not audited accounts.
      </p>
    </div>
  );
}
