"use client";

import getEventPromoAnalytics from "@/actions/getEventPromoAnalytics";
import AnalyticsRowsSkeleton from "@/components/molecules/AnalyticsRowsSkeleton";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import type { DashboardPeriod } from "@/utils/organizerDashboardDateRange";
import { useQuery } from "@tanstack/react-query";

export default function EventPromoBreakdown({
  eventId,
  period,
  startDate,
  endDate,
}: {
  eventId: string;
  period: DashboardPeriod;
  startDate: string | null;
  endDate: string | null;
}) {
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

  const rows = response?.data ?? [];

  if (!isLoading && isError) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-lg">Promo Codes</h2>
        <InlineErrorRetry
          message="We couldn't load promo code usage."
          onRetry={() => refetch()}
        />
      </section>
    );
  }

  if (!isLoading && rows.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-lg">Promo Codes</h2>
        <p className="text-sm text-muted-foreground">
          No promo codes used yet.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">Promo Codes</h2>

      {isLoading ? (
        <AnalyticsRowsSkeleton count={2} />
      ) : (
        <div className="flex flex-col gap-2">
          {/* biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md) */}
          {rows.map((row: any) => (
            <div
              key={row.promo_code}
              className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4 flex justify-between items-center gap-2"
            >
              <div>
                <h3 className="font-semibold">{row.promo_code}</h3>
                <p className="text-xs text-muted-foreground">
                  {row.orders} orders · {row.units_discounted} tickets
                  discounted
                </p>
              </div>
              <span className="text-sm font-medium shrink-0">
                {Number(row.total_discount).toLocaleString()} discount
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
