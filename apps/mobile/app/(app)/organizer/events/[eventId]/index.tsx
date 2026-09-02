import { useEventInsights } from "@/features/organizer/useEventInsights";
import type {
  EventInsightsDateRow,
  EventInsightsFinance,
  EventInsightsOverview,
  EventInsightsPromoRow,
  EventInsightsReturning,
  EventInsightsTicketTypeRow,
  OrganizerDashboardPeriod,
} from "@abonten/api-client";
import { formatFullDateTimeRange } from "@abonten/core/dateFormatter";
import { AppText, Chip, Overline } from "@abonten/ui-native";
import { Link, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

const PERIODS: { key: OrganizerDashboardPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

// PostgREST can serialise the analytics RPCs' bigint/numeric columns as
// strings — coerce every numeric field on read (same as the dashboard).
const n = (v: number | string | null | undefined): number => Number(v ?? 0);

function money(currency: string | null | undefined, amount: number): string {
  return `${currency ? `${currency} ` : ""}${amount.toLocaleString()}`;
}

function SectionTitle({ children }: { children: string }) {
  return <AppText variant="sectionHeading">{children}</AppText>;
}

function Stat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <View className="min-w-[45%] flex-1 gap-1 rounded-xl border border-border bg-card p-3">
      <Overline>{label}</Overline>
      <AppText variant="sectionHeading">{value}</AppText>
      {sublabel ? <AppText variant="caption">{sublabel}</AppText> : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <AppText className="text-sm text-muted-foreground">{label}</AppText>
      <AppText className="text-sm font-medium text-foreground">{value}</AppText>
    </View>
  );
}

function OverviewCards({
  overview,
}: { overview: EventInsightsOverview | null }) {
  if (!overview) {
    return (
      <AppText className="text-sm text-muted-foreground">
        No sales or registration data yet.
      </AppText>
    );
  }

  const currency = overview.currency ?? "";
  const m = (amount: number) => money(currency, amount);
  const grossSales = n(overview.gross_sales);
  const promoCount = n(overview.promo_purchase_count);

  const tiles: { label: string; value: string; sublabel?: string }[] = [];

  if (overview.require_registration) {
    // Free/RSVP events lead with registrations, not a "GHS 0" sales figure.
    tiles.push({
      label: "Registrations",
      value: String(n(overview.tickets_sold)),
    });
    tiles.push({
      label: "Attendees",
      value: String(n(overview.distinct_attendees)),
    });
    tiles.push({
      label: "Cancelled",
      value: String(n(overview.tickets_cancelled)),
    });
    if (overview.capacity != null) {
      tiles.push({
        label: "Remaining",
        value: String(n(overview.capacity_remaining)),
        sublabel: `of ${overview.capacity} capacity`,
      });
    }
    if (grossSales > 0) {
      tiles.push({ label: "Gross Sales", value: m(grossSales) });
    }
    if (promoCount > 0) {
      tiles.push({ label: "Promo Purchases", value: String(promoCount) });
    }
  } else {
    tiles.push({ label: "Gross Sales", value: m(grossSales) });
    tiles.push({
      label: "Tickets Sold",
      value: String(n(overview.tickets_sold)),
    });
    tiles.push({
      label: "Attendees",
      value: String(n(overview.distinct_attendees)),
    });
    tiles.push({
      label: "Cancelled",
      value: String(n(overview.tickets_cancelled)),
    });
    tiles.push({ label: "Promo Purchases", value: String(promoCount) });
    if (overview.capacity != null) {
      tiles.push({
        label: "Remaining",
        value: String(n(overview.capacity_remaining)),
        sublabel: `of ${overview.capacity} capacity`,
      });
    }
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {tiles.map((t) => (
        <Stat
          key={t.label}
          label={t.label}
          value={t.value}
          sublabel={t.sublabel}
        />
      ))}
    </View>
  );
}

function FinanceSection({
  finance,
  period,
}: {
  finance: EventInsightsFinance | null;
  period: OrganizerDashboardPeriod;
}) {
  return (
    <View className="gap-3">
      <SectionTitle>Event Revenue</SectionTitle>
      {!finance ? (
        <AppText className="text-sm text-muted-foreground">
          No revenue data available yet.
        </AppText>
      ) : (
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Row
            label="Ticket sales"
            value={`${finance.currency} ${n(finance.ticketSales).toLocaleString()}`}
          />
          {/* Under the customer-paid-service-fee model the organizer keeps
              100% of the ticket price; older sales that carried a 2%
              deduction still show this row. */}
          {n(finance.platformFee) !== 0 ? (
            <Row
              label="Abonten fees"
              value={`-${finance.currency} ${n(finance.platformFee).toLocaleString()}`}
            />
          ) : null}
          {n(finance.refunds) !== 0 ? (
            <View className="gap-1">
              <Row
                label="Refunds"
                value={`-${finance.currency} ${Math.abs(
                  n(finance.refunds),
                ).toLocaleString()}`}
              />
              {n(finance.pendingRefunds) > 0 ||
              n(finance.completedRefunds) > 0 ? (
                <AppText variant="muted">
                  {n(finance.refundRequestCount)} request
                  {n(finance.refundRequestCount) === 1 ? "" : "s"} ·{" "}
                  {finance.currency}{" "}
                  {n(finance.pendingRefunds).toLocaleString()} pending ·{" "}
                  {finance.currency}{" "}
                  {n(finance.completedRefunds).toLocaleString()} completed
                </AppText>
              ) : null}
            </View>
          ) : null}
          <Row
            label="Net sales"
            value={`${finance.currency} ${n(finance.netSales).toLocaleString()}`}
          />
          <View className="h-px bg-border" />
          <Row
            label="Organizer earnings"
            value={`${finance.currency} ${n(
              finance.organizerEarnings,
            ).toLocaleString()}`}
          />
          <View className="h-px bg-border" />
          {period !== "all" ? (
            <AppText variant="muted">
              Refund breakdown and settlement status are all-time, not limited
              to the selected period.
            </AppText>
          ) : null}
          <AppText className="text-sm font-medium text-foreground">
            Settlement status:{" "}
            {finance.settled ? "Settled" : "Pending settlement"}
          </AppText>
          {finance.settled ? (
            <AppText variant="muted">
              {finance.currency} {n(finance.organizerEarnings).toLocaleString()}{" "}
              is now available in your Finances balance.
            </AppText>
          ) : null}
        </View>
      )}
    </View>
  );
}

function TicketTypesSection({
  rows,
}: {
  rows: EventInsightsTicketTypeRow[];
}) {
  return (
    <View className="gap-3">
      <SectionTitle>Ticket Types</SectionTitle>
      {rows.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">
          No ticket types set up yet.
        </AppText>
      ) : (
        <View className="gap-2">
          {rows.map((row) => {
            const capped = row.quantity_capacity != null;
            const pctSold = Math.min(100, n(row.percent_sold));
            const price = n(row.price);
            const revenue = n(row.revenue);
            const cancelled = n(row.cancelled);
            return (
              <View
                key={row.ticket_type_id}
                className="gap-2 rounded-xl border border-border bg-card p-4"
              >
                <View className="flex-row items-center justify-between gap-2">
                  <AppText className="font-semibold text-foreground">
                    {row.type}
                  </AppText>
                  <AppText className="shrink-0 text-sm text-muted-foreground">
                    {n(row.sold)} sold
                    {capped ? ` / ${row.quantity_capacity}` : " / Unlimited"}
                  </AppText>
                </View>
                {capped ? (
                  <View className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <View
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pctSold}%` }}
                    />
                  </View>
                ) : null}
                <View className="flex-row justify-between">
                  <AppText variant="muted">
                    {price > 0
                      ? `${row.currency ?? ""} ${price.toLocaleString()}`.trim()
                      : "Free"}
                  </AppText>
                  {revenue > 0 ? (
                    <AppText variant="muted">
                      {row.currency ?? ""} {revenue.toLocaleString()} revenue
                    </AppText>
                  ) : null}
                  {cancelled > 0 ? (
                    <AppText variant="muted">{cancelled} cancelled</AppText>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function PromoSection({ rows }: { rows: EventInsightsPromoRow[] }) {
  return (
    <View className="gap-3">
      <SectionTitle>Promo Codes</SectionTitle>
      {rows.length === 0 ? (
        <AppText className="text-sm text-muted-foreground">
          No promo codes used yet.
        </AppText>
      ) : (
        <View className="gap-2">
          {rows.map((row) => (
            <View
              key={row.promo_code}
              className="flex-row items-center justify-between gap-2 rounded-xl border border-border bg-card p-4"
            >
              <View className="flex-1">
                <AppText className="font-semibold text-foreground">
                  {row.promo_code}
                </AppText>
                <AppText variant="muted">
                  {n(row.orders)} orders · {n(row.units_discounted)} tickets
                  discounted
                </AppText>
              </View>
              <AppText className="shrink-0 text-sm font-medium text-foreground">
                {n(row.total_discount).toLocaleString()} discount
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function DateSection({ rows }: { rows: EventInsightsDateRow[] }) {
  return (
    <View className="gap-3">
      <SectionTitle>Attendance by Date</SectionTitle>
      <View className="gap-2">
        {rows.map((row) => {
          const label = row.starts_at
            ? formatFullDateTimeRange(row.starts_at, row.ends_at)
            : null;
          return (
            <View
              key={row.occurrence_id ?? "unassigned"}
              className="flex-row items-center justify-between gap-2 rounded-xl border border-border bg-card p-4"
            >
              <View className="flex-1">
                <AppText className="font-semibold text-foreground">
                  {label ? label.date : "Before date-tracking"}
                </AppText>
                {label ? <AppText variant="muted">{label.time}</AppText> : null}
              </View>
              <View className="shrink-0 items-end">
                <AppText className="text-sm font-medium text-foreground">
                  {n(row.tickets_sold)} attendees
                </AppText>
                {n(row.tickets_cancelled) > 0 ? (
                  <AppText variant="muted">
                    {n(row.tickets_cancelled)} cancelled
                  </AppText>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ReturningSection({
  returning,
}: {
  returning: EventInsightsReturning;
}) {
  const ret = n(returning.returning_count);
  const first = n(returning.first_time_count);
  const total = ret + first;

  return (
    <View className="gap-3">
      <SectionTitle>Attendee Behavior</SectionTitle>
      {total === 0 ? (
        <AppText className="text-sm text-muted-foreground">
          Not enough attendees yet to calculate returning vs. first-time.
        </AppText>
      ) : (
        <View className="gap-2">
          <View className="h-2 w-full flex-row overflow-hidden rounded-full bg-muted">
            <View
              className="h-full bg-primary"
              style={{ width: `${(ret / total) * 100}%` }}
            />
          </View>
          <View className="flex-row justify-between">
            <AppText className="text-sm text-foreground">
              Returning: {Math.round((ret / total) * 100)}%{" "}
              <AppText className="text-muted-foreground">({ret})</AppText>
            </AppText>
            <AppText className="text-sm text-foreground">
              First-time: {Math.round((first / total) * 100)}%{" "}
              <AppText className="text-muted-foreground">({first})</AppText>
            </AppText>
          </View>
        </View>
      )}
    </View>
  );
}

export default function EventInsightsScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [period, setPeriod] = useState<OrganizerDashboardPeriod>("all");
  const q = useEventInsights(eventId ?? "", period);

  const result = q.data;
  const insights = result && result.status === 200 ? result.data : null;

  const dateRange = insights?.overview?.starts_at
    ? formatFullDateTimeRange(
        insights.overview.starts_at,
        insights.overview.ends_at,
      )
    : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 p-4 pb-16"
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
        />
      }
    >
      <View>
        <AppText variant="screenTitle">
          {insights?.overview?.event_title ?? "Event insights"}
        </AppText>
        {dateRange ? (
          <AppText className="mt-1 text-sm text-muted-foreground">
            {dateRange.date} · {dateRange.time}
          </AppText>
        ) : null}
      </View>

      {eventId ? (
        <View className="flex-row gap-2">
          <Link href={`/(app)/organizer/events/${eventId}/edit`} asChild>
            <Pressable className="flex-1 items-center rounded-xl border border-primary px-4 py-2.5 active:opacity-80">
              <AppText className="text-sm font-semibold text-primary">
                Edit event
              </AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/organizer/events/${eventId}/promote`} asChild>
            <Pressable className="flex-1 items-center rounded-xl border border-primary px-4 py-2.5 active:opacity-80">
              <AppText className="text-sm font-semibold text-primary">
                Promote
              </AppText>
            </Pressable>
          </Link>
        </View>
      ) : null}

      {eventId ? (
        <View className="gap-2">
          <Link href={`/(app)/organizer/events/${eventId}/attendees`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                Attendees &amp; check-in
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
          <Link href={`/(app)/organizer/events/${eventId}/promo-codes`} asChild>
            <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
              <AppText className="text-base text-foreground">
                Manage promo codes
              </AppText>
              <AppText className="text-muted-foreground">›</AppText>
            </Pressable>
          </Link>
        </View>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Chip
            key={p.key}
            label={p.label}
            selected={p.key === period}
            onPress={() => setPeriod(p.key)}
          />
        ))}
      </View>

      {q.isLoading ? (
        <View className="items-center py-12">
          <ActivityIndicator />
        </View>
      ) : q.isError || (result && result.status !== 200) ? (
        <View className="items-center gap-3 py-12">
          <AppText className="text-center text-muted-foreground">
            {(result && result.status === 403 && result.message) ||
              (result && result.status !== 200 && result.message) ||
              "Couldn't load this event's insights."}
          </AppText>
          <Pressable
            className="rounded-lg bg-primary px-4 py-2 active:opacity-90"
            onPress={() => q.refetch()}
          >
            <AppText className="font-semibold text-primary-foreground">
              Retry
            </AppText>
          </Pressable>
        </View>
      ) : insights ? (
        <>
          <View className="gap-3">
            <SectionTitle>Overview</SectionTitle>
            <OverviewCards overview={insights.overview} />
          </View>

          <FinanceSection finance={insights.finance} period={period} />
          <TicketTypesSection rows={insights.ticketTypes} />
          <PromoSection rows={insights.promos} />
          {insights.dates.hasOccurrences ? (
            <DateSection rows={insights.dates.rows} />
          ) : null}
          <ReturningSection returning={insights.returning} />
        </>
      ) : null}

      {eventId ? (
        <Link href={`/(app)/event/${eventId}`} asChild>
          <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
            <AppText className="text-base text-foreground">
              View public event page
            </AppText>
            <AppText className="text-muted-foreground">›</AppText>
          </Pressable>
        </Link>
      ) : null}
    </ScrollView>
  );
}
