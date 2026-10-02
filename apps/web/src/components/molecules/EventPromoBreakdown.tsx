"use client";

import getEventPromoAnalytics from "@/actions/getEventPromoAnalytics";
import AnalyticsRowsSkeleton from "@/components/molecules/AnalyticsRowsSkeleton";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { formatMoney } from "@abonten/core/formatMoney";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

export default function EventPromoBreakdown({
  eventId,
  period,
  startDate,
  endDate,
  currency,
}: {
  eventId: string;
  /** The event's currency: a discount is an amount of money. */
  currency: string | null;
  period: DashboardPeriod;
  startDate: string | null;
  endDate: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations("common");

  const {
    data: response,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["event-analytics-promo", eventId, period],
    queryFn: () => getEventPromoAnalytics(eventId, startDate, endDate),
    staleTime: 20_000,
  });

  const rows = response?.status === 200 ? response.data : [];

  if (!isLoading && isError) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-lg">{t("promoCodes")}</h2>
        <InlineErrorRetry
          message={t("weCouldnTLoadPromoCode")}
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-lg">{t("promoCodes")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("noPromoCodesUsedYet")}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">{t("promoCodes")}</h2>

      {isLoading ? (
        <AnalyticsRowsSkeleton count={2} />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <div
              key={row.promo_code}
              className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4 flex justify-between items-center gap-2"
            >
              <div>
                <h3 className="font-semibold">{row.promo_code}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("ordersTicketsDiscounted", {
                    orders: row.orders,
                    units_discounted: row.units_discounted,
                  })}
                </p>
              </div>
              <span className="text-sm font-medium shrink-0">
                {t("discount", {
                  amount: formatMoney(currency, Number(row.total_discount), {
                    locale,
                  }),
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
