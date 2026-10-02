"use client";

import getEventDateAnalytics from "@/actions/getEventDateAnalytics";
import AnalyticsRowsSkeleton from "@/components/molecules/AnalyticsRowsSkeleton";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { formatFullDateTimeRange } from "@abonten/core/dateFormatter";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

export default function EventDateBreakdown({
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
  const locale = useLocale();

  const t = useTranslations("common");

  const {
    data: response,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["event-analytics-dates", eventId, period],
    queryFn: () => getEventDateAnalytics(eventId, startDate, endDate),
    staleTime: 20_000,
  });

  // Single-date/range events never have event_occurrence rows, which is the
  // common case — render nothing at all (not even a heading) rather than an
  // empty "Per-Date Breakdown" section. Only for a genuinely successful
  // response, so a failed request below still surfaces as an error instead
  // of silently vanishing.
  if (!isLoading && response?.status === 200 && !response.hasOccurrences) {
    return null;
  }

  const rows = response?.status === 200 ? response.data : [];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">{t("attendanceByDate")}</h2>

      {isLoading ? (
        <AnalyticsRowsSkeleton count={2} />
      ) : isError ? (
        <InlineErrorRetry
          message={t("weCouldnTLoadThePer")}
          onRetry={() => refetch()}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const label = row.starts_at
              ? formatFullDateTimeRange(
                  row.starts_at,
                  row.ends_at,
                  undefined,
                  locale,
                )
              : null;

            return (
              <div
                key={row.occurrence_id ?? "unassigned"}
                className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4 flex justify-between items-center gap-2"
              >
                <div>
                  <h3 className="font-semibold">
                    {label ? label.date : t("beforeDateTracking")}
                  </h3>
                  {label && (
                    <p className="text-xs text-muted-foreground">
                      {label.time}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">
                    {t("attendees", { tickets_sold: row.tickets_sold })}
                  </p>
                  {row.tickets_cancelled > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("cancelled2", {
                        tickets_cancelled: row.tickets_cancelled,
                      })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
