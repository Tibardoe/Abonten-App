"use client";

import getEventDateAnalytics from "@/actions/getEventDateAnalytics";
import AnalyticsRowsSkeleton from "@/components/molecules/AnalyticsRowsSkeleton";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import { formatFullDateTimeRange } from "@/utils/dateFormatter";
import type { DashboardPeriod } from "@/utils/organizerDashboardDateRange";
import { useQuery } from "@tanstack/react-query";

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

  const rows = response?.data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">Attendance by Date</h2>

      {isLoading ? (
        <AnalyticsRowsSkeleton count={2} />
      ) : isError ? (
        <InlineErrorRetry
          message="We couldn't load the per-date breakdown."
          onRetry={() => refetch()}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {/* biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md) */}
          {rows.map((row: any) => {
            const label = row.starts_at
              ? formatFullDateTimeRange(row.starts_at, row.ends_at)
              : null;

            return (
              <div
                key={row.occurrence_id ?? "unassigned"}
                className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4 flex justify-between items-center gap-2"
              >
                <div>
                  <h3 className="font-semibold">
                    {label ? label.date : "Before date-tracking"}
                  </h3>
                  {label && (
                    <p className="text-xs text-muted-foreground">
                      {label.time}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-medium">
                    {row.tickets_sold} attendees
                  </p>
                  {row.tickets_cancelled > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {row.tickets_cancelled} cancelled
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
