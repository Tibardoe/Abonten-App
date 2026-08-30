"use client";

import getOrganizerDashboardOverview from "@/actions/getOrganizerDashboardOverview";
import getOrganizerEventPerformance from "@/actions/getOrganizerEventPerformance";
import getOrganizerNeedsAttention from "@/actions/getOrganizerNeedsAttention";
import getOrganizerRecentActivity from "@/actions/getOrganizerRecentActivity";
import getOrganizerSalesTimeline from "@/actions/getOrganizerSalesTimeline";
import getOrganizerUpcomingEvents from "@/actions/getOrganizerUpcomingEvents";
import EventUploadButton from "@/components/atoms/EventUploadButton";
import DashboardPeriodFilter from "@/components/molecules/DashboardPeriodFilter";
import OrganizerEventPerformanceList from "@/components/molecules/OrganizerEventPerformanceList";
import OrganizerFinanceSummary from "@/components/molecules/OrganizerFinanceSummary";
import OrganizerNeedsAttention from "@/components/molecules/OrganizerNeedsAttention";
import OrganizerOverviewCards from "@/components/molecules/OrganizerOverviewCards";
import OrganizerRecentActivity from "@/components/molecules/OrganizerRecentActivity";
import OrganizerSalesTimelineChart from "@/components/molecules/OrganizerSalesTimelineChart";
import OrganizerUpcomingEvents from "@/components/molecules/OrganizerUpcomingEvents";
import { PageTitle, SectionTitle } from "@/components/ui/typography";
import { useCurrentUserDetails } from "@/hooks/useCurrentUser";
import type {
  DashboardBucket,
  DashboardPeriod,
} from "@abonten/core/organizerDashboardDateRange";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md)
type Row = any;

// Every section below is its own useQuery — independent loading states, and
// a stale mutation (purchase/cancel/registration) only needs to invalidate
// this page's TanStack Query cache or wait out the shared staleTime, same
// as EventAnalyticsDashboard's precedent.
const STALE_TIME = 20_000;

export default function OrganizerDashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const [performanceSort, setPerformanceSort] = useState<"revenue" | "tickets">(
    "revenue",
  );

  const { data: userDetails } = useCurrentUserDetails();

  const overviewQuery = useQuery({
    queryKey: ["organizer-dashboard-overview", period],
    queryFn: () => getOrganizerDashboardOverview(period),
    staleTime: STALE_TIME,
  });

  const timelineQuery = useQuery({
    queryKey: ["organizer-dashboard-timeline", period],
    queryFn: () => getOrganizerSalesTimeline(period),
    staleTime: STALE_TIME,
  });

  const performanceQuery = useQuery({
    queryKey: ["organizer-dashboard-performance", period, performanceSort],
    queryFn: () => getOrganizerEventPerformance(period, performanceSort, 10),
    staleTime: STALE_TIME,
  });

  const upcomingQuery = useQuery({
    queryKey: ["organizer-dashboard-upcoming"],
    queryFn: () => getOrganizerUpcomingEvents(5),
    staleTime: STALE_TIME,
  });

  const attentionQuery = useQuery({
    queryKey: ["organizer-dashboard-attention"],
    queryFn: () => getOrganizerNeedsAttention(7),
    staleTime: STALE_TIME,
  });

  const activityQuery = useQuery({
    queryKey: ["organizer-dashboard-activity"],
    queryFn: () => getOrganizerRecentActivity(8),
    staleTime: STALE_TIME,
  });

  const overviewData = overviewQuery.data;
  const overview: { current: Row[]; previous: Row[] | null } | null =
    overviewData && overviewData.status === 200
      ? {
          current: overviewData.data.current,
          previous: overviewData.data.previous,
        }
      : null;
  const hasNoEvents =
    !overviewQuery.isLoading &&
    overview !== null &&
    Number(overview.current[0]?.total_events_count ?? 0) === 0;

  const primaryCurrency = overview?.current?.[0]?.currency ?? "GHS";

  const timelineResult = timelineQuery.data;
  const timelineData: Row[] =
    timelineResult && timelineResult.status === 200 ? timelineResult.data : [];
  const timelineBucket: DashboardBucket =
    (timelineResult &&
      timelineResult.status === 200 &&
      timelineResult.bucket) ||
    "day";

  const performanceResult = performanceQuery.data;
  const performanceEvents: Row[] =
    performanceResult && performanceResult.status === 200
      ? performanceResult.data
      : [];

  const upcomingResult = upcomingQuery.data;
  const upcomingEvents: Row[] =
    upcomingResult && upcomingResult.status === 200 ? upcomingResult.data : [];

  const attentionResult = attentionQuery.data;
  const attentionItems: Row[] =
    attentionResult && attentionResult.status === 200
      ? attentionResult.data
      : [];

  const activityResult = activityQuery.data;
  const activityItems: Row[] =
    activityResult && activityResult.status === 200 ? activityResult.data : [];

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  })();

  if (hasNoEvents) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-16">
        <PageTitle>Welcome to your Organizer Dashboard</PageTitle>
        <p className="text-sm text-muted-foreground max-w-sm">
          Create your first event to start tracking your sales and performance.
        </p>
        <div className="bg-primary text-primary-foreground rounded-md px-4 py-2">
          <EventUploadButton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle>
          {greeting}
          {userDetails?.username ? `, ${userDetails.username}` : ""}
        </PageTitle>
      </div>

      <DashboardPeriodFilter value={period} onChange={setPeriod} />

      <OrganizerOverviewCards
        overview={overview}
        period={period}
        isLoading={overviewQuery.isLoading}
        isError={overviewQuery.isError}
        onRetry={() => overviewQuery.refetch()}
      />

      <OrganizerFinanceSummary />

      <section className="flex flex-col gap-3">
        <SectionTitle>Sales Over Time</SectionTitle>
        <OrganizerSalesTimelineChart
          data={timelineData}
          bucket={timelineBucket}
          currency={primaryCurrency}
          isLoading={timelineQuery.isLoading}
          isError={timelineQuery.isError}
          onRetry={() => timelineQuery.refetch()}
        />
      </section>

      <OrganizerEventPerformanceList
        events={performanceEvents}
        sort={performanceSort}
        onSortChange={setPerformanceSort}
        isLoading={performanceQuery.isLoading}
        isError={performanceQuery.isError}
        onRetry={() => performanceQuery.refetch()}
      />

      <OrganizerUpcomingEvents
        events={upcomingEvents}
        isLoading={upcomingQuery.isLoading}
        isError={upcomingQuery.isError}
        onRetry={() => upcomingQuery.refetch()}
      />

      <OrganizerNeedsAttention
        items={attentionItems}
        isLoading={attentionQuery.isLoading}
        isError={attentionQuery.isError}
        onRetry={() => attentionQuery.refetch()}
      />

      <OrganizerRecentActivity
        items={activityItems}
        isLoading={activityQuery.isLoading}
        isError={activityQuery.isError}
        onRetry={() => activityQuery.refetch()}
      />
    </div>
  );
}
