"use client";

import getEventReturningAttendeeStats from "@/actions/getEventReturningAttendeeStats";
import StatTilesSkeleton from "@/components/molecules/StatTilesSkeleton";
import { useQuery } from "@tanstack/react-query";

export default function EventReturningAttendeeStats({
  eventId,
}: {
  eventId: string;
}) {
  const { data: response, isLoading } = useQuery({
    queryKey: ["event-analytics-returning", eventId],
    queryFn: () => getEventReturningAttendeeStats(eventId),
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
