import StatTile from "@/components/atoms/StatTile";
import TrendIndicator from "@/components/atoms/TrendIndicator";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import StatTilesSkeleton from "@/components/molecules/StatTilesSkeleton";
import {
  DASHBOARD_PERIOD_COMPARISON_LABELS,
  type DashboardPeriod,
} from "@abonten/core/organizerDashboardDateRange";

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type Row = any;

type Trend =
  | { kind: "none" }
  | { kind: "new" }
  | { kind: "percent"; value: number };

// "All Time" has no meaningful prior period; a previous value of exactly 0
// against a current value of 0 is genuinely nothing to compare either —
// both cases render no trend rather than a fabricated 0%/Infinity%.
function computeTrend(current: number, previous: number | null): Trend {
  if (previous === null) return { kind: "none" };
  if (previous === 0 && current === 0) return { kind: "none" };
  if (previous === 0) return { kind: "new" };
  return { kind: "percent", value: ((current - previous) / previous) * 100 };
}

function TrendLine({
  trend,
  comparisonLabel,
}: {
  trend: Trend;
  comparisonLabel: string | null;
}) {
  if (trend.kind === "none" || !comparisonLabel) return null;
  if (trend.kind === "new") {
    return <p className="text-xs mt-1 text-primary">New {comparisonLabel}</p>;
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
  if (isLoading) {
    return <StatTilesSkeleton count={4} />;
  }

  if (isError) {
    return (
      <InlineErrorRetry
        message="We couldn't load your overview stats."
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
        No dashboard data available.
      </p>
    );
  }

  const primary = current[0];
  const primaryPrev = previous?.[0] ?? null;
  const comparisonLabel = DASHBOARD_PERIOD_COMPARISON_LABELS[period];

  const money = (amount: number, currency: string | null) =>
    `${currency ? `${currency} ` : ""}${Number(amount).toLocaleString()}`;

  const ticketsSold = Number(primary.tickets_sold ?? 0);
  const registrations = Number(primary.registrations ?? 0);
  const grossSales = Number(primary.gross_sales ?? 0);

  // Paid and free events use different vocabulary (Phase 7): an organizer
  // with only paid events sees "Tickets Sold", only free events sees
  // "Registrations", and a mix sees a combined figure so neither number is
  // silently dropped.
  const ticketsLabel =
    ticketsSold > 0 && registrations > 0
      ? "Ticket Holders / Registrations"
      : registrations > 0
        ? "Registrations"
        : "Tickets Sold";
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
          label="Gross Sales"
          value={money(grossSales, primary.currency)}
          footer={
            <TrendLine trend={grossTrend} comparisonLabel={comparisonLabel} />
          }
        />

        <StatTile
          label={ticketsLabel}
          value={ticketsValue.toLocaleString()}
          footer={
            <TrendLine trend={ticketsTrend} comparisonLabel={comparisonLabel} />
          }
        />

        <StatTile
          label="Active Events"
          value={String(primary.active_events_count ?? 0)}
          sublabel={`of ${primary.total_events_count ?? 0} published`}
        />

        <StatTile
          label="Ticket Holders"
          value={String(primary.distinct_purchasers ?? 0)}
        />
      </div>

      {otherCurrencyRows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Also sold in{" "}
          {otherCurrencyRows
            .map((row) => money(Number(row.gross_sales ?? 0), row.currency))
            .join(", ")}
          .
        </p>
      )}
    </div>
  );
}
