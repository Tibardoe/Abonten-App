import StatTile from "@/components/atoms/StatTile";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import StatTilesSkeleton from "@/components/molecules/StatTilesSkeleton";
import { formatMoney } from "@abonten/core/formatMoney";
import type { EventOverviewAnalytics } from "@abonten/types/eventAnalytics";
import { useLocale, useTranslations } from "next-intl";

export default function EventOverviewCards({
  overview,
  isLoading,
  isError,
  onRetry,
}: {
  overview: EventOverviewAnalytics | null;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("common");

  if (isLoading) {
    return <StatTilesSkeleton count={6} />;
  }

  if (isError) {
    return (
      <InlineErrorRetry
        message={t("weCouldnTLoadThisEvent2")}
        onRetry={() => onRetry?.()}
      />
    );
  }

  if (!overview) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("noSalesOrRegistrationDataYet")}
      </p>
    );
  }

  const currency = overview.currency ?? "";
  const money = (amount: number) =>
    formatMoney(currency, Number(amount), { locale });

  // Free/RSVP events lead with registrations, not a sales figure that would
  // otherwise misleadingly read as "GHS 0" — Gross Sales is only shown if
  // the event actually generated some (e.g. a paid add-on ticket type).
  if (overview.require_registration) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatTile
          label={t("registrations")}
          value={String(overview.tickets_sold)}
        />
        <StatTile
          label={t("attendees2")}
          value={String(overview.distinct_attendees)}
        />
        <StatTile
          label={t("cancelled")}
          value={String(overview.tickets_cancelled)}
        />
        {overview.capacity != null && (
          <StatTile
            label={t("remaining")}
            value={String(overview.capacity_remaining)}
            sublabel={t("ofCapacity", { capacity: overview.capacity })}
          />
        )}
        {overview.gross_sales > 0 && (
          <StatTile
            label={t("grossSales")}
            value={money(overview.gross_sales)}
          />
        )}
        {overview.promo_purchase_count > 0 && (
          <StatTile
            label={t("promoPurchases")}
            value={String(overview.promo_purchase_count)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <StatTile label={t("grossSales")} value={money(overview.gross_sales)} />
      <StatTile
        label={t("ticketsSold")}
        value={String(overview.tickets_sold)}
      />
      <StatTile
        label={t("attendees2")}
        value={String(overview.distinct_attendees)}
      />
      <StatTile
        label={t("cancelled")}
        value={String(overview.tickets_cancelled)}
      />
      <StatTile
        label={t("promoPurchases")}
        value={String(overview.promo_purchase_count)}
      />
      {overview.capacity != null && (
        <StatTile
          label={t("remaining")}
          value={String(overview.capacity_remaining)}
          sublabel={t("ofCapacity", { capacity: overview.capacity })}
        />
      )}
    </div>
  );
}
