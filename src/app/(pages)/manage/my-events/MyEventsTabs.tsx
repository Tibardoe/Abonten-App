"use client";

import { getEventsAwaitingReview } from "@/actions/getEventsAwaitingReview";
import getMyEventsTabCounts, {
  type MyEventsTabCounts,
} from "@/actions/getMyEventsTabCounts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PaginatedResult } from "@/types/pagination";
import type { UserTicketType } from "@/types/ticketType";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import EventsToReviewList from "./EventsToReviewList";
import ReviewedEventsList from "./ReviewedEventsList";
import TicketsList from "./TicketsList";
import { type MyEventsTab, isMyEventsTab } from "./myEventsTab";

const noActiveTicketsState = (
  <div className="text-center space-y-3 py-10">
    <p className="text-muted-foreground">No active tickets.</p>
    <Link
      href="/"
      className="inline-block text-sm font-semibold text-primary underline"
    >
      Discover events
    </Link>
  </div>
);

const noCancelledTicketsState = (
  <p className="text-center text-muted-foreground text-sm py-10">
    No cancelled tickets.
  </p>
);

const noRefundsState = (
  <div className="text-center space-y-1 py-10">
    <p className="font-semibold">No refunds yet</p>
    <p className="text-muted-foreground text-sm">
      Refunds for cancelled ticket purchases will appear here when applicable.
    </p>
  </div>
);

type TicketPage = PaginatedResult<UserTicketType> | null;
type FetchTicketPage = (
  cursor: string | null,
) => Promise<PaginatedResult<UserTicketType>>;
// biome-ignore lint/suspicious/noExplicitAny: no generated Supabase types exist in this repo (see PROJECT.md) -- matches getUserEventReviews.ts's own return type
type ReviewPage = PaginatedResult<any> | null;
// biome-ignore lint/suspicious/noExplicitAny: see above
type FetchReviewPage = (cursor: string | null) => Promise<PaginatedResult<any>>;

export default function MyEventsTabs({
  initialTab,
  initialCounts,
  activeInitialPage,
  cancelledInitialPage,
  refundsInitialPage,
  reviewedInitialPage,
  fetchActivePage,
  fetchCancelledPage,
  fetchRefundsPage,
  fetchReviewedPage,
}: {
  initialTab: MyEventsTab;
  initialCounts: MyEventsTabCounts;
  activeInitialPage: TicketPage;
  cancelledInitialPage: TicketPage;
  refundsInitialPage: TicketPage;
  reviewedInitialPage: ReviewPage;
  fetchActivePage: FetchTicketPage;
  fetchCancelledPage: FetchTicketPage;
  fetchRefundsPage: FetchTicketPage;
  fetchReviewedPage: FetchReviewPage;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentTab = isMyEventsTab(searchParams.get("tab") ?? undefined)
    ? (searchParams.get("tab") as MyEventsTab)
    : initialTab;

  // Counts stay client-fetched (seeded from the server's initial load) so
  // cancelling a ticket can invalidate ["attending-events-counts"] and the
  // badges update immediately, the same way the lists already do — see
  // invalidateTicketStatusQueries.
  const { data: counts } = useQuery({
    queryKey: ["attending-events-counts"],
    queryFn: async () => (await getMyEventsTabCounts()).data,
    initialData: initialCounts,
  });

  // "To Review" has no server-seeded count (see page.tsx's comment) — it
  // shares the exact same query EventsToReviewList uses, so this doesn't add
  // a second fetch, just reads the same cached result for the badge.
  const { data: toReviewData } = useQuery({
    queryKey: ["events-awaiting-review"],
    queryFn: () => getEventsAwaitingReview(),
  });
  const toReviewCount = toReviewData?.data.length ?? 0;

  function handleTabChange(value: string) {
    if (!isMyEventsTab(value)) return;

    // Shallow URL update via the native History API — keeps the tab
    // bookmarkable/shareable/refreshable without triggering a server
    // round-trip on every click, since this page's Server Component would
    // otherwise re-run (and re-fetch counts + the tab's first page) on every
    // searchParams-changing navigation. See Next.js's "Native History API"
    // guide — pushState/replaceState still stay in sync with useSearchParams.
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange}>
      <div className="flex justify-center">
        <TabsList className="grid w-full grid-cols-5 md:w-auto md:inline-grid md:min-w-[560px]">
          <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled ({counts.cancelled})
          </TabsTrigger>
          <TabsTrigger value="refunds">Refunds ({counts.refunds})</TabsTrigger>
          <TabsTrigger value="toReview">
            To Review ({toReviewCount})
          </TabsTrigger>
          <TabsTrigger value="reviewed">
            Reviewed ({counts.reviewed})
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="active">
        <TicketsList
          queryKey={["attending-events", "active"]}
          initialPage={activeInitialPage}
          fetchPage={fetchActivePage}
          emptyState={noActiveTicketsState}
        />
      </TabsContent>

      <TabsContent value="cancelled">
        <TicketsList
          queryKey={["attending-events", "cancelled"]}
          initialPage={cancelledInitialPage}
          fetchPage={fetchCancelledPage}
          emptyState={noCancelledTicketsState}
        />
      </TabsContent>

      <TabsContent value="refunds">
        <TicketsList
          queryKey={["attending-events", "refunds"]}
          initialPage={refundsInitialPage}
          fetchPage={fetchRefundsPage}
          emptyState={noRefundsState}
          showRefundInfo
        />
      </TabsContent>

      <TabsContent value="toReview">
        <EventsToReviewList />
      </TabsContent>

      <TabsContent value="reviewed">
        <ReviewedEventsList
          initialPage={reviewedInitialPage}
          fetchPage={fetchReviewedPage}
        />
      </TabsContent>
    </Tabs>
  );
}
