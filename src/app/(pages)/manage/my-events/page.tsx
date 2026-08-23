export const dynamic = "force-dynamic";

import getMyEventsTabCounts from "@/actions/getMyEventsTabCounts";
import getUserAttendingEvents from "@/actions/getUserAttendingEvents";
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

export default async function page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = isMyEventsTab(tab) ? tab : "active";

  // Only the currently selected tab's first page is fetched server-side —
  // the other two stay null and load lazily (via fetchPage) the first time
  // the user actually switches to them, so a visit to /manage/my-events
  // never pays for all three lists just to render one.
  const [counts, selectedTabFirstPage] = await Promise.all([
    getMyEventsTabCounts(),
    initialTab === "active"
      ? getUserAttendingEvents({ status: "active" })
      : initialTab === "cancelled"
        ? getUserAttendingEvents({ status: "cancelled" })
        : getUserTicketRefunds(),
  ]);

  const activeInitialPage: PaginatedResult<UserTicketType> | null =
    initialTab === "active" ? selectedTabFirstPage : null;
  const cancelledInitialPage: PaginatedResult<UserTicketType> | null =
    initialTab === "cancelled" ? selectedTabFirstPage : null;
  const refundsInitialPage: PaginatedResult<UserTicketType> | null =
    initialTab === "refunds" ? selectedTabFirstPage : null;

  return (
    <div className="space-y-5">
      <h1 className="text-xl md:text-2xl font-bold">My Tickets</h1>

      <MyEventsTabs
        initialTab={initialTab}
        initialCounts={counts.data}
        activeInitialPage={activeInitialPage}
        cancelledInitialPage={cancelledInitialPage}
        refundsInitialPage={refundsInitialPage}
        fetchActivePage={fetchActivePage}
        fetchCancelledPage={fetchCancelledPage}
        fetchRefundsPage={fetchRefundsPage}
      />
    </div>
  );
}
