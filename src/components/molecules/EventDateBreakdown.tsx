"use client";

import getEventDateAnalytics from "@/actions/getEventDateAnalytics";
import AnalyticsRowsSkeleton from "@/components/molecules/AnalyticsRowsSkeleton";
import { formatFullDateTimeRange } from "@/utils/dateFormatter";
import { useQuery } from "@tanstack/react-query";

export default function EventDateBreakdown({ eventId }: { eventId: string }) {
  const { data: response, isLoading } = useQuery({
    queryKey: ["event-analytics-dates", eventId],
    queryFn: () => getEventDateAnalytics(eventId),
    staleTime: 20_000,
  });

  // Single-date/range events never have event_occurrence rows, which is the
  // common case — render nothing at all (not even a heading) rather than an
  // empty "Per-Date Breakdown" section.
  if (!isLoading && response?.status === 200 && !response.hasOccurrences) {
    return null;
  }

  const rows = response?.data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">Attendance by Date</h2>

      {isLoading ? (
        <AnalyticsRowsSkeleton count={2} />
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
