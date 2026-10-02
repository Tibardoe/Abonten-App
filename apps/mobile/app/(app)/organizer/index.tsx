import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { DashboardWidgets } from "@/components/organizer/DashboardWidgets";
import { DashboardSkeleton } from "@/components/skeletons";
import { useEventDrafts } from "@/features/events/useEventDrafts";
import {
  useOrganizerDashboardWidgets,
  useOrganizerOverview,
} from "@/features/organizer/useOrganizer";
import { usePlaceDrafts } from "@/features/places/usePlaceDrafts";
import { useQueryView } from "@/lib/useQueryView";
import type {
  OrganizerDashboardPeriod,
  OrganizerOverviewResult,
  OrganizerOverviewRow,
} from "@abonten/api-client";
import { formatMoney } from "@abonten/core/formatMoney";
import { formatCount, formatPercent } from "@abonten/core/i18n/format";
import {
  AppText,
  Chip,
  Icon,
  type IoniconName,
  Overline,
  Refresher,
} from "@abonten/ui-native";
import {
  getCurrentLocale,
  useLocale,
  useTranslations,
} from "@abonten/ui-native/i18n";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

const PERIODS: { key: OrganizerDashboardPeriod; label: string }[] = [
  { key: "today", label: "periods.today" },
  { key: "7d", label: "periods.7d" },
  { key: "30d", label: "periods.30d" },
  { key: "all", label: "periods.all" },
];

const n = (v: number | string | null | undefined): number => Number(v ?? 0);

function money(currency: string | null, amount: number | string): string {
  return formatMoney(currency, n(amount), { locale: getCurrentLocale() });
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
  const { locale } = useLocale();
  const t = useTranslations("manage");

  if (pct == null) {
    return (
      <AppText variant="caption">{compact ? "—" : t("vsLastPeriod")}</AppText>
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
        {formatPercent(Math.round(pct), locale, { signDisplay: "always" })}
      </AppText>
      {compact ? null : (
        <AppText variant="caption">{t("vsLastPeriod2")}</AppText>
      )}
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
  const { locale } = useLocale();
  const t = useTranslations("manage");

  const [period, setPeriod] = useState<OrganizerDashboardPeriod>("30d");
  const widgetsQuery = useOrganizerDashboardWidgets(period);
  // The KPI rows arrive in the same payload as the widgets (one API call,
  // one database round trip). An older deploy without `overview` falls back
  // to the separate overview() request so the cards never go blank.
  const inlineOverview =
    widgetsQuery.data?.status === 200 ? widgetsQuery.data.data.overview : null;
  const fallbackOverview = useOrganizerOverview(period, {
    enabled: widgetsQuery.data?.status === 200 && !inlineOverview,
  });
  // One shape for the KPI section whichever path fed it.
  const q: {
    data: OrganizerOverviewResult | undefined;
    isRefetching: boolean;
    refetch: () => unknown;
  } = inlineOverview
    ? {
        data: { status: 200, data: inlineOverview },
        isRefetching: widgetsQuery.isRefetching,
        refetch: widgetsQuery.refetch,
      }
    : widgetsQuery.data?.status === 200
      ? fallbackOverview
      : {
          // The single dashboard request carries the KPIs; until it settles
          // (or if it fails) the KPI section mirrors its state.
          data: widgetsQuery.data ?? undefined,
          isRefetching: widgetsQuery.isRefetching,
          refetch: widgetsQuery.refetch,
        };
  // Loading, offline and failed are told apart from "no events yet": that is
  // only ever said for an answer the server gave. The dashboard is never
  // cached on disk (money), so offline with nothing loaded this session
  // says so rather than showing zero sales.
  const kpiView = useQueryView<unknown>(
    !inlineOverview && widgetsQuery.data?.status === 200
      ? fallbackOverview
      : widgetsQuery,
  );
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
  const primaryCurrency = moneyRows[0]?.currency ?? "";
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
        <Refresher
          onRefresh={() => Promise.all([q.refetch(), widgetsQuery.refetch()])}
        />
      }
    >
      <View className="flex-row flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Chip
            key={p.key}
            label={t(p.label)}
            selected={p.key === period}
            onPress={() => setPeriod(p.key)}
          />
        ))}
      </View>

      {kpiView.kind !== "content" && kpiView.kind !== "empty" ? (
        <QueryUnavailable
          view={kpiView}
          subject={t("yourDashboard")}
          onRetry={() => q.refetch()}
          loading={<DashboardSkeleton />}
        />
      ) : !hasEvents ? (
        <View className="items-center gap-3 py-12">
          <AppText variant="sectionHeading">{t("noEventsYet")}</AppText>
          <AppText className="text-center text-sm text-muted-foreground">
            {t("publishYourFirstEventToStart")}
          </AppText>
          <Link href="/(app)/event/new" asChild>
            <Pressable className="rounded-lg bg-primary px-4 py-2 active:opacity-90">
              <AppText className="font-semibold text-primary-foreground">
                {t("createEvent")}
              </AppText>
            </Pressable>
          </Link>
        </View>
      ) : (
        <>
          {/* Headline KPIs — gross sales leads, the two counts sit under it */}
          <View className="gap-2">
            <KpiHero
              label={t("grossSales2")}
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
                label={t("ticketsSold2")}
                icon="ticket-outline"
                value={formatCount(n(head?.tickets_sold), locale)}
                delta={period === "all" ? undefined : ticketsDelta}
              />
              <KpiMini
                label={t("activeEvents")}
                icon="calendar-outline"
                value={formatCount(n(head?.active_events_count), locale)}
              />
            </View>
          </View>

          {moneyRows.length > 1 ? (
            <View className="rounded-xl border border-border bg-card p-3">
              <AppText variant="caption">{t("otherCurrencies")}</AppText>
              {moneyRows.slice(1).map((r) => (
                <AppText key={r.currency} variant="metaStrong">
                  {money(r.currency, r.gross_sales)}
                </AppText>
              ))}
            </View>
          ) : null}

          {/* Secondary metrics */}
          <View className="gap-3 rounded-2xl border border-border bg-card p-4">
            <Overline>{t("thisPeriod")}</Overline>
            <View className="flex-row flex-wrap gap-y-3">
              <MetricRow
                label={t("paidOrders")}
                value={formatCount(n(moneyRows[0]?.paid_orders), locale)}
              />
              <MetricRow
                label={t("buyers")}
                value={formatCount(
                  n(moneyRows[0]?.distinct_purchasers),
                  locale,
                )}
              />
              <MetricRow
                label={t("discounts")}
                value={money(
                  moneyRows[0]?.currency ?? primaryCurrency,
                  moneyRows[0]?.total_discount ?? 0,
                )}
              />
              <MetricRow
                label={t("registrations")}
                value={formatCount(n(head?.registrations), locale)}
              />
              <MetricRow
                label={t("cancelled")}
                value={formatCount(n(head?.tickets_cancelled), locale)}
              />
              <MetricRow
                label={t("upcomingEvents")}
                value={formatCount(n(head?.upcoming_events_count), locale)}
              />
              <MetricRow
                label={t("totalEvents")}
                value={formatCount(n(head?.total_events_count), locale)}
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
              {t("createEvent")}
            </AppText>
          </Pressable>
        </Link>
        <NavRow href="/(app)/organizer/events" label={t("myEvents2")} />
        {draftCount > 0 ? (
          <NavRow
            href="/(app)/organizer/event-drafts"
            label={t("eventDrafts2", { draftCount: draftCount })}
          />
        ) : null}
        <NavRow href="/(app)/organizer/places" label={t("myPlaces2")} />
        {placeDraftCount > 0 ? (
          <NavRow
            href="/(app)/organizer/place-drafts"
            label={t("placeDrafts2", { placeDraftCount: placeDraftCount })}
          />
        ) : null}
        <NavRow
          href="/(app)/organizer/verification"
          label={t("organizerVerification")}
        />
        <NavRow href="/(app)/organizer/finance" label={t("finances")} />
      </View>
    </ScrollView>
  );
}
