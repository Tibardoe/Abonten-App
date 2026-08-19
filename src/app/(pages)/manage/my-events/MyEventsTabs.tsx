"use client";

import getMyEventsTabCounts, {
  type MyEventsTabCounts,
} from "@/actions/getMyEventsTabCounts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PaginatedResult } from "@/types/pagination";
import type { UserTicketType } from "@/types/ticketType";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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

export default function MyEventsTabs({
  initialTab,
  initialCounts,
  activeInitialPage,
  cancelledInitialPage,
  refundsInitialPage,
  fetchActivePage,
  fetchCancelledPage,
  fetchRefundsPage,
}: {
  initialTab: MyEventsTab;
  initialCounts: MyEventsTabCounts;
  activeInitialPage: TicketPage;
  cancelledInitialPage: TicketPage;
  refundsInitialPage: TicketPage;
  fetchActivePage: FetchTicketPage;
  fetchCancelledPage: FetchTicketPage;
  fetchRefundsPage: FetchTicketPage;
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
      <TabsList className="grid w-full grid-cols-3 md:w-auto md:inline-grid md:min-w-[360px]">
        <TabsTrigger value="active">Active ({counts.active})</TabsTrigger>
        <TabsTrigger value="cancelled">
          Cancelled ({counts.cancelled})
        </TabsTrigger>
        <TabsTrigger value="refunds">Refunds ({counts.refunds})</TabsTrigger>
      </TabsList>

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
    </Tabs>
  );
}
