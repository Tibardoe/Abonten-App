"use client";

import StatTile from "@/components/atoms/StatTile";
import TrendIndicator from "@/components/atoms/TrendIndicator";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import StatTilesSkeleton from "@/components/molecules/StatTilesSkeleton";
import { useMarketContext } from "@/hooks/useMarketContext";
import {
  type TrendResult,
  computeTrend,
} from "@abonten/core/admin/computeTrend";
import { formatMoney } from "@abonten/core/formatMoney";
import { formatCount } from "@abonten/core/i18n/format";
import {
  type DashboardPeriod,
  dashboardPeriodComparisonLabel,
} from "@abonten/core/organizerDashboardDateRange";
import type { OrganizerOverviewRow } from "@abonten/types/eventAnalytics";
import { useLocale, useTranslations } from "next-intl";

type Row = OrganizerOverviewRow;

// The rule lives in @abonten/core/admin/computeTrend so the organizer
// dashboard and the admin console can never disagree about what a
// percentage means: "All Time" has no prior period, and 0 against 0 is
// nothing to compare — both render no trend rather than a fabricated
// 0%/Infinity%.

function TrendLine({
  trend,
  comparisonLabel,
}: {
  trend: TrendResult;
  comparisonLabel: string | null;
}) {
  const t = useTranslations("common");

  if (trend.kind === "none" || !comparisonLabel) return null;
  if (trend.kind === "new") {
    return (
      <p className="text-xs mt-1 text-primary">
        {t("newText", { comparisonLabel: comparisonLabel })}
      </p>
    );
  }
  return <TrendIndicator percentChange={trend.value} label={comparisonLabel} />;
}

export default function OrganizerOverviewCards({
  overview,
  period,
  isLoading,
  isError,
  onRetry,
}: {
  overview: { current: Row[]; previous: Row[] | null } | null;
  period: DashboardPeriod;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("common");
  const tc = useTranslations("core");

  // No sales yet means no currency on the overview row; show zero in the
  // market's currency rather than as a bare "0.00".
  const { market } = useMarketContext();
  const fallbackCurrency = market?.defaultCurrency ?? null;

  if (isLoading) {
    return <StatTilesSkeleton count={4} />;
  }

  if (isError) {
    return (
      <InlineErrorRetry
        message={t("weCouldnTLoadYourOverview")}
        onRetry={() => onRetry?.()}
      />
    );
  }

  const current = overview?.current ?? [];
  const previous = overview?.previous ?? null;

  // The RPC always returns at least one row (see get_organizer_dashboard_
  // overview) even for a zero-sales organizer, so this only stays empty if
  // the request itself failed.
  if (current.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("noDashboardDataAvailable")}
      </p>
    );
  }

  const primary = current[0];
  const primaryPrev = previous?.[0] ?? null;
  const comparisonLabel = dashboardPeriodComparisonLabel(tc, period);

  const money = (amount: number, currency: string | null) =>
    formatMoney(currency ?? fallbackCurrency, Number(amount), { locale });

  const ticketsSold = Number(primary.tickets_sold ?? 0);
  const registrations = Number(primary.registrations ?? 0);
  const grossSales = Number(primary.gross_sales ?? 0);

  // Paid and free events use different vocabulary (Phase 7): an organizer
  // with only paid events sees "Tickets Sold", only free events sees
  // "Registrations", and a mix sees a combined figure so neither number is
  // silently dropped.
  const ticketsLabel =
    ticketsSold > 0 && registrations > 0
      ? t("ticketHoldersRegistrations")
      : registrations > 0
        ? t("registrations")
        : t("ticketsSold");
  const ticketsValue =
    ticketsSold > 0 && registrations > 0
      ? ticketsSold + registrations
      : registrations > 0
        ? registrations
        : ticketsSold;

  const grossTrend = computeTrend(
    grossSales,
    primaryPrev ? Number(primaryPrev.gross_sales ?? 0) : null,
  );
  const ticketsTrend = computeTrend(
    ticketsValue,
    primaryPrev
      ? Number(primaryPrev.tickets_sold ?? 0) +
          Number(primaryPrev.registrations ?? 0)
      : null,
  );

  // Multiple currencies across the organizer's events is rare, but money
  // must never be silently summed across currencies — show each separately
  // if it happens.
  const otherCurrencyRows = current.slice(1).filter((row) => row.currency);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          label={t("grossSales")}
          value={money(grossSales, primary.currency)}
          footer={
            <TrendLine trend={grossTrend} comparisonLabel={comparisonLabel} />
          }
        />

        <StatTile
          label={ticketsLabel}
          value={formatCount(ticketsValue, locale)}
          footer={
            <TrendLine trend={ticketsTrend} comparisonLabel={comparisonLabel} />
          }
        />

        <StatTile
          label={t("activeEvents")}
          value={String(primary.active_events_count ?? 0)}
          sublabel={t("ofPublished", {
            value: primary.total_events_count ?? 0,
          })}
        />

        <StatTile
          label={t("ticketHolders")}
          value={String(primary.distinct_purchasers ?? 0)}
        />
      </div>

      {otherCurrencyRows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("alsoSoldIn", {
            join: otherCurrencyRows
              .map((row) => money(Number(row.gross_sales ?? 0), row.currency))
              .join(", "),
          })}
        </p>
      )}
    </div>
  );
}
