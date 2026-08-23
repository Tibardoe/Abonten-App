export const dynamic = "force-dynamic";

import getMyEventsTabCounts from "@/actions/getMyEventsTabCounts";
import getUserAttendingEvents from "@/actions/getUserAttendingEvents";
import { getUserEventReviews } from "@/actions/getUserEventReviews";
import getUserTicketRefunds from "@/actions/getUserTicketRefunds";
import type { PaginatedResult } from "@/types/pagination";
import type { UserTicketType } from "@/types/ticketType";
import MyEventsTabs from "./MyEventsTabs";
import { isMyEventsTab } from "./myEventsTab";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

async function fetchActivePage(cursor: string | null) {
  "use server";
  return getUserAttendingEvents({ status: "active", cursor });
}

async function fetchCancelledPage(cursor: string | null) {
  "use server";
  return getUserAttendingEvents({ status: "cancelled", cursor });
}

async function fetchRefundsPage(cursor: string | null) {
  "use server";
  return getUserTicketRefunds({ cursor });
}

async function fetchReviewedPage(cursor: string | null) {
  "use server";
  return getUserEventReviews({ cursor });
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
  // pays for every list just to render one. "To Review" has no server-side
  // prefetch at all — EventsToReviewList always fetches it client-side (see
  // its own comment for why: no pagination, small list).
  const [counts, selectedTabFirstPage] = await Promise.all([
    getMyEventsTabCounts(),
    initialTab === "active"
      ? getUserAttendingEvents({ status: "active" })
      : initialTab === "cancelled"
        ? getUserAttendingEvents({ status: "cancelled" })
        : initialTab === "refunds"
          ? getUserTicketRefunds()
          : initialTab === "reviewed"
            ? getUserEventReviews()
            : null,
  ]);

  const activeInitialPage: PaginatedResult<UserTicketType> | null =
    initialTab === "active"
      ? (selectedTabFirstPage as PaginatedResult<UserTicketType>)
      : null;
  const cancelledInitialPage: PaginatedResult<UserTicketType> | null =
    initialTab === "cancelled"
      ? (selectedTabFirstPage as PaginatedResult<UserTicketType>)
      : null;
  const refundsInitialPage: PaginatedResult<UserTicketType> | null =
    initialTab === "refunds"
      ? (selectedTabFirstPage as PaginatedResult<UserTicketType>)
      : null;
  // biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md) -- matches getUserEventReviews.ts's own return type
  const reviewedInitialPage: PaginatedResult<any> | null =
    initialTab === "reviewed" ? selectedTabFirstPage : null;

  return (
    <div className="space-y-5">
      <h1 className="text-xl md:text-2xl font-bold">My Tickets</h1>

      <MyEventsTabs
        initialTab={initialTab}
        initialCounts={counts.data}
        activeInitialPage={activeInitialPage}
        cancelledInitialPage={cancelledInitialPage}
        refundsInitialPage={refundsInitialPage}
        reviewedInitialPage={reviewedInitialPage}
        fetchActivePage={fetchActivePage}
        fetchCancelledPage={fetchCancelledPage}
        fetchRefundsPage={fetchRefundsPage}
        fetchReviewedPage={fetchReviewedPage}
      />
    </div>
  );
}
