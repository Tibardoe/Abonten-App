"use client";

import getEventReturningAttendeeStats from "@/actions/getEventReturningAttendeeStats";
import InlineErrorRetry from "@/components/molecules/InlineErrorRetry";
import StatTilesSkeleton from "@/components/molecules/StatTilesSkeleton";
import type { DashboardPeriod } from "@abonten/core/organizerDashboardDateRange";
import { useQuery } from "@tanstack/react-query";

export default function EventReturningAttendeeStats({
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
    queryKey: ["event-analytics-returning", eventId, period],
    queryFn: () => getEventReturningAttendeeStats(eventId, startDate, endDate),
    staleTime: 20_000,
  });

  const stats = response?.status === 200 ? response.data : null;
  const total = stats
    ? Number(stats.returning_count) + Number(stats.first_time_count)
    : 0;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-bold md:text-lg">Attendee Behavior</h2>

      {isLoading ? (
        <StatTilesSkeleton count={2} />
      ) : isError ? (
        <InlineErrorRetry
          message="We couldn't load attendee behavior."
          onRetry={() => refetch()}
        />
      ) : !stats || total === 0 ? (
        <p className="text-sm text-muted-foreground">
          Not enough attendees yet to calculate returning vs. first-time.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
            <div
              className="h-full bg-primary"
              style={{
                width: `${(Number(stats.returning_count) / total) * 100}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span>
              Returning:{" "}
              {Math.round((Number(stats.returning_count) / total) * 100)}%
              <span className="text-muted-foreground">
                {" "}
                ({stats.returning_count})
              </span>
            </span>
            <span>
              First-time:{" "}
              {Math.round((Number(stats.first_time_count) / total) * 100)}%
              <span className="text-muted-foreground">
                {" "}
                ({stats.first_time_count})
              </span>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
