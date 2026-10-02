"use client";

import getOrganizerDashboard from "@/actions/getOrganizerDashboard";
import getOrganizerEventPerformance from "@/actions/getOrganizerEventPerformance";
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
import type {
  OrganizerActivityRow,
  OrganizerAttentionRow,
  OrganizerEventPerformanceRow,
  OrganizerOverviewRow,
  OrganizerSalesTimelinePoint,
  OrganizerUpcomingEventRow,
} from "@abonten/types/eventAnalytics";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import OrganizerVerificationCard from "@/verification/molecules/OrganizerVerificationCard";
import { useTranslations } from "next-intl";
type Row = OrganizerOverviewRow;

// The whole page is one question (getOrganizerDashboard): the KPIs, the
// timeline and every list arrive together, in one round trip. Each section
// used to be its own Server Action, and a browser runs those one at a
// time, so the last list appeared six round trips after the first card.
// The one thing asked separately is the events list sorted by tickets,
// and only when someone chooses that sort.
//
// A purchase, a cancellation or a registration invalidates this page's
// queries by their "organizer-dashboard" key prefix
// (utils/mutationQueryInvalidation.ts), or the shared staleTime runs out.
const STALE_TIME = 20_000;

export default function OrganizerDashboard() {
  const t = useTranslations("common");

  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const [performanceSort, setPerformanceSort] = useState<"revenue" | "tickets">(
    "revenue",
  );

  const { data: userDetails } = useCurrentUserDetails();

  const dashboardQuery = useQuery({
    queryKey: ["organizer-dashboard", period],
    queryFn: () => getOrganizerDashboard(period),
    staleTime: STALE_TIME,
  });

  const byTicketsQuery = useQuery({
    queryKey: ["organizer-dashboard-performance", period, "tickets"],
    queryFn: () => getOrganizerEventPerformance(period, "tickets", 10),
    enabled: performanceSort === "tickets",
    staleTime: STALE_TIME,
  });

  const dashboard =
    dashboardQuery.data?.status === 200 ? dashboardQuery.data.data : null;
  const isLoading = dashboardQuery.isLoading;
  // An answer that says it failed is a failure too: it used to render as
  // an empty dashboard, as if nothing had been sold.
  const isError =
    dashboardQuery.isError ||
    (dashboardQuery.data !== undefined && dashboardQuery.data.status !== 200);
  const retry = () => dashboardQuery.refetch();

  const overview: { current: Row[]; previous: Row[] | null } | null =
    dashboard?.overview ?? null;
  const hasNoEvents =
    !isLoading &&
    overview !== null &&
    Number(overview.current[0]?.total_events_count ?? 0) === 0;

  const primaryCurrency = overview?.current?.[0]?.currency ?? "";

  const timelineData: OrganizerSalesTimelinePoint[] =
    dashboard?.timeline.rows ?? [];
  const timelineBucket: DashboardBucket = dashboard?.timeline.bucket ?? "day";

  const byTickets = byTicketsQuery.data;
  const sortedByTickets = performanceSort === "tickets";
  const performanceEvents: OrganizerEventPerformanceRow[] = sortedByTickets
    ? byTickets && byTickets.status === 200
      ? byTickets.data
      : []
    : (dashboard?.performance ?? []);

  const upcomingEvents: OrganizerUpcomingEventRow[] = dashboard?.upcoming ?? [];
  const attentionItems: OrganizerAttentionRow[] = dashboard?.attention ?? [];
  const activityItems: OrganizerActivityRow[] = dashboard?.activity ?? [];

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return t("goodMorning");
    if (hour < 18) return t("goodAfternoon");
    return t("goodEvening");
  })();

  // First name when the person has given one, else their handle.
  const greetingName =
    userDetails?.full_name?.trim().split(/\s+/)[0] || userDetails?.username;

  if (hasNoEvents) {
    return (
      <div className="flex flex-col items-center text-center gap-4 py-16">
        <PageTitle>{t("welcomeToYourOrganizerDashboard")}</PageTitle>
        <p className="text-sm text-muted-foreground max-w-sm">
          {t("createYourFirstEventToStart")}
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
          {greetingName ? `, ${greetingName}` : ""}
        </PageTitle>
      </div>

      <DashboardPeriodFilter value={period} onChange={setPeriod} />

      <OrganizerOverviewCards
        overview={overview}
        period={period}
        isLoading={isLoading}
        isError={isError}
        onRetry={retry}
      />

      <OrganizerFinanceSummary />

      <OrganizerVerificationCard />

      <section className="flex flex-col gap-3">
        <SectionTitle>{t("salesOverTime")}</SectionTitle>
        <OrganizerSalesTimelineChart
          data={timelineData}
          bucket={timelineBucket}
          currency={primaryCurrency}
          isLoading={isLoading}
          isError={isError}
          onRetry={retry}
        />
      </section>

      <OrganizerEventPerformanceList
        events={performanceEvents}
        sort={performanceSort}
        onSortChange={setPerformanceSort}
        isLoading={sortedByTickets ? byTicketsQuery.isLoading : isLoading}
        isError={
          sortedByTickets
            ? byTicketsQuery.isError ||
              (byTickets !== undefined && byTickets.status !== 200)
            : isError
        }
        onRetry={sortedByTickets ? () => byTicketsQuery.refetch() : retry}
      />

      <OrganizerUpcomingEvents
        events={upcomingEvents}
        isLoading={isLoading}
        isError={isError}
        onRetry={retry}
      />

      <OrganizerNeedsAttention
        items={attentionItems}
        isLoading={isLoading}
        isError={isError}
        onRetry={retry}
      />

      <OrganizerRecentActivity
        items={activityItems}
        isLoading={isLoading}
        isError={isError}
        onRetry={retry}
      />
    </div>
  );
}
