export const dynamic = "force-dynamic";

import getMyEventsTabCounts from "@/actions/getMyEventsTabCounts";
import getUserAttendingEvents from "@/actions/getUserAttendingEvents";
import getUserTicketRefunds from "@/actions/getUserTicketRefunds";
import { PageTitle } from "@/components/ui/typography";
import type { PaginatedResult } from "@/types/pagination";
import type { UserTicketType } from "@/types/ticketType";
import type { Metadata } from "next";
import MyEventsTabs from "./MyEventsTabs";
import { isMyEventsTab } from "./myEventsTab";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// This route had no page-specific metadata before -- every page in the app
// besides /places/[slug] falls back to the root layout's generic "Abonten
// Hub | Connecting people to experiences" title, which is what actually
// shows in the browser tab here despite the on-page heading already saying
// "My Tickets".
export const metadata: Metadata = {
  title: "My Tickets | Abonten Hub",
};

async function fetchActivePage(cursor: string | null) {
  "use server";
  return getUserAttendingEvents({
    status: "active",
    timeframe: "active",
    cursor,
  });
}

async function fetchPastPage(cursor: string | null) {
  "use server";
  return getUserAttendingEvents({
    status: "active",
    timeframe: "past",
    cursor,
  });
}

async function fetchCancelledPage(cursor: string | null) {
  "use server";
  return getUserAttendingEvents({ status: "cancelled", cursor });
}

async function fetchRefundsPage(cursor: string | null) {
  "use server";
  return getUserTicketRefunds({ cursor });
}

export default async function page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = isMyEventsTab(tab) ? tab : "active";

  // Only the currently selected tab's first page is fetched server-side —
  // the others stay null and load lazily (via fetchPage) the first time the
  // user actually switches to them, so a visit to /manage/my-events never
  // pays for every list just to render one. "To Review" and "Reviewed" have
  // no server-side prefetch at all — both always fetch client-side (see
  // EventsToReviewList.tsx's and ReviewedTabContent.tsx's own comments).
  const [counts, selectedTabFirstPage] = await Promise.all([
    getMyEventsTabCounts(),
    initialTab === "active"
      ? getUserAttendingEvents({ status: "active", timeframe: "active" })
      : initialTab === "past"
        ? getUserAttendingEvents({ status: "active", timeframe: "past" })
        : initialTab === "cancelled"
          ? getUserAttendingEvents({ status: "cancelled" })
          : initialTab === "refunds"
            ? getUserTicketRefunds()
            : null,
  ]);

  const activeInitialPage: PaginatedResult<UserTicketType> | null =
    initialTab === "active" ? selectedTabFirstPage : null;
  const pastInitialPage: PaginatedResult<UserTicketType> | null =
    initialTab === "past" ? selectedTabFirstPage : null;
  const cancelledInitialPage: PaginatedResult<UserTicketType> | null =
    initialTab === "cancelled" ? selectedTabFirstPage : null;
  const refundsInitialPage: PaginatedResult<UserTicketType> | null =
    initialTab === "refunds" ? selectedTabFirstPage : null;

  return (
    <div className="space-y-5">
      <PageTitle>My Tickets</PageTitle>

      <MyEventsTabs
        initialTab={initialTab}
        initialCounts={counts.data}
        activeInitialPage={activeInitialPage}
        pastInitialPage={pastInitialPage}
        cancelledInitialPage={cancelledInitialPage}
        refundsInitialPage={refundsInitialPage}
        fetchActivePage={fetchActivePage}
        fetchPastPage={fetchPastPage}
        fetchCancelledPage={fetchCancelledPage}
        fetchRefundsPage={fetchRefundsPage}
      />
    </div>
  );
}
