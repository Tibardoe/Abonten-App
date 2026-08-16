"use client";

import getEventOverviewAnalytics from "@/actions/getEventOverviewAnalytics";
import EventDateBreakdown from "@/components/molecules/EventDateBreakdown";
import EventOverviewCards from "@/components/molecules/EventOverviewCards";
import EventPromoBreakdown from "@/components/molecules/EventPromoBreakdown";
import EventReturningAttendeeStats from "@/components/molecules/EventReturningAttendeeStats";
import EventTicketTypeBreakdown from "@/components/molecules/EventTicketTypeBreakdown";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFullDateTimeRange } from "@/utils/dateFormatter";
import { useQuery } from "@tanstack/react-query";

export default function EventAnalyticsDashboard({
  eventId,
}: {
  eventId: string;
}) {
  const { data: overviewResponse, isLoading } = useQuery({
    queryKey: ["event-analytics-overview", eventId],
    queryFn: () => getEventOverviewAnalytics(eventId),
    staleTime: 20_000,
  });

  const overview =
    overviewResponse?.status === 200 ? overviewResponse.data : null;

  // Multi-date events leave event.starts_at/ends_at null (dates live on
  // event_occurrence instead — see EventDateBreakdown below), so this
  // single-range header line only renders when there's a single date to show.
  const dateRange = overview?.starts_at
    ? formatFullDateTimeRange(overview.starts_at, overview.ends_at)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        {isLoading ? (
          <Skeleton className="h-7 w-64" />
        ) : (
          <h1 className="font-bold text-xl md:text-2xl">
            {overview?.event_title ?? "Event"}
          </h1>
        )}
        {dateRange && (
          <p className="text-sm text-muted-foreground mt-1">
            {dateRange.date} &middot; {dateRange.time}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-lg">Overview</h2>
        <EventOverviewCards overview={overview} isLoading={isLoading} />
      </section>

      <EventTicketTypeBreakdown eventId={eventId} />
      <EventPromoBreakdown eventId={eventId} />
      <EventDateBreakdown eventId={eventId} />
      <EventReturningAttendeeStats eventId={eventId} />
    </div>
  );
}
