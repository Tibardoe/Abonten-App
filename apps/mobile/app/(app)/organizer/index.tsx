import { DashboardWidgets } from "@/components/organizer/DashboardWidgets";
import { DashboardSkeleton } from "@/components/skeletons";
import { useEventDrafts } from "@/features/events/useEventDrafts";
import {
  useOrganizerDashboardWidgets,
  useOrganizerOverview,
} from "@/features/organizer/useOrganizer";
import { usePlaceDrafts } from "@/features/places/usePlaceDrafts";
import type {
  OrganizerDashboardPeriod,
  OrganizerOverviewRow,
} from "@abonten/api-client";
import {
  AppText,
  Chip,
  Icon,
  type IoniconName,
  Overline,
} from "@abonten/ui-native";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

const PERIODS: { key: OrganizerDashboardPeriod; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
];

const n = (v: number | string | null | undefined): number => Number(v ?? 0);

function money(currency: string | null, amount: number | string): string {
  return `${currency ?? "GHS"} ${n(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Percent change vs. the previous period. null when there's no comparable
// prior figure (e.g. "All time", or the organizer had nothing last period).
function pctChange(current: number, previous: number | null | undefined) {
  if (previous == null) return null;
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}

function Delta({
  pct,
  compact = false,
}: {
  pct: number | null;
  compact?: boolean;
}) {
  if (pct == null) {
    return (
      <AppText variant="caption">{compact ? "—" : "— vs last period"}</AppText>
    );
  }
  const up = pct >= 0;
  return (
    <View className="flex-row items-center gap-1">
      <Icon
        name={up ? "trending-up" : "trending-down"}
        size={13}
        tone={up ? "success" : "destructive"}
      />
      <AppText
        variant="caption"
        tone={up ? "success" : "error"}
        className="font-medium"
      >
        {up ? "+" : "−"}
        {Math.abs(Math.round(pct))}%
      </AppText>
      {compact ? null : <AppText variant="caption">vs last period</AppText>}
    </View>
  );
}

// Gross sales is the headline number — its own full-width card.
function KpiHero({
  label,
  value,
  icon,
  delta,
}: {
  label: string;
  value: string;
  icon: IoniconName;
  delta?: number | null;
}) {
  return (
    <View className="gap-1 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-1.5">
        <Icon name={icon} size={14} tone="muted" />
        <Overline>{label}</Overline>
      </View>
      <AppText variant="hero" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </AppText>
      {delta !== undefined ? <Delta pct={delta} /> : null}
    </View>
  );
}

// The two supporting counts — a 2-up row of smaller cards under the hero.
function KpiMini({
  label,
  value,
  icon,
  delta,
}: {
  label: string;
  value: string;
  icon: IoniconName;
  delta?: number | null;
}) {
  return (
    <View className="flex-1 gap-1 rounded-2xl border border-border bg-card p-4">
      <View className="flex-row items-center gap-1.5">
        <Icon name={icon} size={13} tone="muted" />
        <Overline>{label}</Overline>
      </View>
      <AppText variant="sectionTitle" numberOfLines={1}>
        {value}
      </AppText>
      {delta !== undefined ? <Delta pct={delta} compact /> : null}
    </View>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-[47%] gap-0.5">
      <AppText variant="caption">{label}</AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

function NavRow({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3 active:opacity-80">
        <AppText className="text-base text-foreground">{label}</AppText>
        <AppText className="text-muted-foreground">›</AppText>
      </Pressable>
    </Link>
  );
}

export default function OrganizerDashboard() {
  const [period, setPeriod] = useState<OrganizerDashboardPeriod>("30d");
  const q = useOrganizerOverview(period);
  const widgetsQuery = useOrganizerDashboardWidgets(period);
  const draftsQuery = useEventDrafts();
  const draftCount =
    draftsQuery.data?.status === 200 ? draftsQuery.data.data.length : 0;
  const placeDraftsQuery = usePlaceDrafts();
  const placeDraftCount =
    placeDraftsQuery.data?.status === 200
      ? placeDraftsQuery.data.data.length
      : 0;

  const result = q.data;
  const rows: OrganizerOverviewRow[] =
    result && result.status === 200 ? result.data.current : [];
  const prevRows: OrganizerOverviewRow[] | null =
    result && result.status === 200 ? result.data.previous : null;
  const head = rows[0];
  const prevHead = prevRows?.[0] ?? null;
  const hasEvents = n(head?.total_events_count) > 0;

  // Money is per sales currency; tickets + event counts are organiser-wide
  // and identical on every row.
  const moneyRows = rows.filter((r) => r.currency != null);
  const prevMoney = prevRows?.filter((r) => r.currency != null) ?? null;
  const primaryCurrency = moneyRows[0]?.currency ?? "GHS";
  // Match the primary currency row across periods so the delta compares
  // like with like rather than "row 0" against "row 0".
  const prevPrimaryMoney =
    prevMoney?.find((r) => r.currency === primaryCurrency) ??
    prevMoney?.[0] ??
    null;
  const grossDelta = moneyRows[0]
    ? pctChange(n(moneyRows[0].gross_sales), prevPrimaryMoney?.gross_sales)
    : null;
  const ticketsDelta = pctChange(
    n(head?.tickets_sold),
    prevHead ? n(prevHead.tickets_sold) : null,
  );
  const widgets =
    widgetsQuery.data?.status === 200 ? widgetsQuery.data.data : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-12"
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching || widgetsQuery.isRefetching}
          onRefresh={() => {
            q.refetch();
            widgetsQuery.refetch();
          }}
        />
      }
    >
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
        <DashboardSkeleton />
      ) : q.isError || (result && result.status !== 200) ? (
        <View className="items-center gap-3 py-12">
          <AppText className="text-center text-muted-foreground">
            {(result && result.status !== 200 && result.message) ||
              "Couldn't load your dashboard."}
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
      ) : !hasEvents ? (
        <View className="items-center gap-3 py-12">
          <AppText variant="sectionHeading">No events yet</AppText>
          <AppText className="text-center text-sm text-muted-foreground">
            Publish your first event to start seeing sales here.
          </AppText>
          <Link href="/(app)/event/new" asChild>
            <Pressable className="rounded-lg bg-primary px-4 py-2 active:opacity-90">
              <AppText className="font-semibold text-primary-foreground">
                + Create event
              </AppText>
            </Pressable>
          </Link>
        </View>
      ) : (
        <>
          {/* Headline KPIs — gross sales leads, the two counts sit under it */}
          <View className="gap-2">
            <KpiHero
              label="Gross sales"
              icon="cash-outline"
              value={
                moneyRows[0]
                  ? money(moneyRows[0].currency, moneyRows[0].gross_sales)
                  : money(primaryCurrency, 0)
              }
              delta={period === "all" ? undefined : grossDelta}
            />
            <View className="flex-row gap-2">
              <KpiMini
                label="Tickets sold"
                icon="ticket-outline"
                value={n(head?.tickets_sold).toLocaleString()}
                delta={period === "all" ? undefined : ticketsDelta}
              />
              <KpiMini
                label="Active events"
                icon="calendar-outline"
                value={n(head?.active_events_count).toLocaleString()}
              />
            </View>
          </View>

          {moneyRows.length > 1 ? (
            <View className="rounded-xl border border-border bg-card p-3">
              <AppText variant="caption">Other currencies</AppText>
              {moneyRows.slice(1).map((r) => (
                <AppText key={r.currency} variant="metaStrong">
                  {money(r.currency, r.gross_sales)}
                </AppText>
              ))}
            </View>
          ) : null}

          {/* Secondary metrics */}
          <View className="gap-3 rounded-2xl border border-border bg-card p-4">
            <Overline>This period</Overline>
            <View className="flex-row flex-wrap gap-y-3">
              <MetricRow
                label="Paid orders"
                value={n(moneyRows[0]?.paid_orders).toLocaleString()}
              />
              <MetricRow
                label="Buyers"
                value={n(moneyRows[0]?.distinct_purchasers).toLocaleString()}
              />
              <MetricRow
                label="Discounts"
                value={money(
                  moneyRows[0]?.currency ?? primaryCurrency,
                  moneyRows[0]?.total_discount ?? 0,
                )}
              />
              <MetricRow
                label="Registrations"
                value={n(head?.registrations).toLocaleString()}
              />
              <MetricRow
                label="Cancelled"
                value={n(head?.tickets_cancelled).toLocaleString()}
              />
              <MetricRow
                label="Upcoming events"
                value={n(head?.upcoming_events_count).toLocaleString()}
              />
              <MetricRow
                label="Total events"
                value={n(head?.total_events_count).toLocaleString()}
              />
            </View>
          </View>

          {widgets ? (
            <DashboardWidgets widgets={widgets} currency={primaryCurrency} />
          ) : null}
        </>
      )}

      <View className="gap-2">
        <Link href="/(app)/event/new" asChild>
          <Pressable className="items-center rounded-xl bg-primary px-4 py-3 active:opacity-90">
            <AppText className="text-base font-semibold text-primary-foreground">
              + Create event
            </AppText>
          </Pressable>
        </Link>
        <NavRow href="/(app)/organizer/events" label="My events" />
        {draftCount > 0 ? (
          <NavRow
            href="/(app)/organizer/event-drafts"
            label={`Event drafts (${draftCount})`}
          />
        ) : null}
        <NavRow href="/(app)/organizer/places" label="My places" />
        {placeDraftCount > 0 ? (
          <NavRow
            href="/(app)/organizer/place-drafts"
            label={`Place drafts (${placeDraftCount})`}
          />
        ) : null}
        <NavRow href="/(app)/organizer/finance" label="Finances" />
      </View>
    </ScrollView>
  );
}
