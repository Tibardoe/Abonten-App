"use client";

import getEventOverviewAnalytics from "@/actions/getEventOverviewAnalytics";
import DashboardPeriodFilter from "@/components/molecules/DashboardPeriodFilter";
import EventDateBreakdown from "@/components/molecules/EventDateBreakdown";
import EventFinanceSummary from "@/components/molecules/EventFinanceSummary";
import EventOverviewCards from "@/components/molecules/EventOverviewCards";
import EventPromoBreakdown from "@/components/molecules/EventPromoBreakdown";
import EventReturningAttendeeStats from "@/components/molecules/EventReturningAttendeeStats";
import EventTicketTypeBreakdown from "@/components/molecules/EventTicketTypeBreakdown";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFullDateTimeRange } from "@/utils/dateFormatter";
import {
  type DashboardPeriod,
  getDashboardPeriodRange,
} from "@/utils/organizerDashboardDateRange";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export default function EventAnalyticsDashboard({
  eventId,
}: {
  eventId: string;
}) {
  const [period, setPeriod] = useState<DashboardPeriod>("all");
  const { start, end } = getDashboardPeriodRange(period);
  const startDate = start?.toISOString() ?? null;
  const endDate = end?.toISOString() ?? null;

  const {
    data: overviewResponse,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["event-analytics-overview", eventId, period],
    queryFn: () => getEventOverviewAnalytics(eventId, startDate, endDate),
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

      <DashboardPeriodFilter
        value={period}
        onChange={setPeriod}
        ariaLabel="Event insights time period"
      />

      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-lg">Overview</h2>
        <EventOverviewCards
          overview={overview}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => refetch()}
        />
      </section>

      <EventFinanceSummary
        eventId={eventId}
        period={period}
        startDate={startDate}
        endDate={endDate}
      />
      <EventTicketTypeBreakdown
        eventId={eventId}
        period={period}
        startDate={startDate}
        endDate={endDate}
      />
      <EventPromoBreakdown
        eventId={eventId}
        period={period}
        startDate={startDate}
        endDate={endDate}
      />
      <EventDateBreakdown
        eventId={eventId}
        period={period}
        startDate={startDate}
        endDate={endDate}
      />
      <EventReturningAttendeeStats
        eventId={eventId}
        period={period}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}
