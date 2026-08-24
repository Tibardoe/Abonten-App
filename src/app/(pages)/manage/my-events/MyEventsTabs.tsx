"use client";

import { getEventsAwaitingReview } from "@/actions/getEventsAwaitingReview";
import getMyEventsTabCounts, {
  type MyEventsTabCounts,
} from "@/actions/getMyEventsTabCounts";
import { cn } from "@/components/lib/utils";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PaginatedResult } from "@/types/pagination";
import type { UserTicketType } from "@/types/ticketType";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { IoChevronDown } from "react-icons/io5";
import EventsToReviewList from "./EventsToReviewList";
import ReviewedTabContent from "./ReviewedTabContent";
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

  // "To Review" has no server-seeded count (see page.tsx's comment) — it
  // shares the exact same query EventsToReviewList uses, so this doesn't add
  // a second fetch, just reads the same cached result for the badge.
  const { data: toReviewData } = useQuery({
    queryKey: ["events-awaiting-review"],
    queryFn: () => getEventsAwaitingReview(),
  });
  const toReviewCount = toReviewData?.data.length ?? 0;
  // "Reviewed" is one outer tab covering both Events and Places (see
  // ReviewedTabContent.tsx), so its badge is the combined total.
  const reviewedCount = counts.reviewed + counts.reviewedPlaces;

  // "To Review" and "Reviewed" share one primary-row slot (see the Popover
  // below) rather than each getting their own tab — that's what used to push
  // the tab strip wide enough to force horizontal scroll on mobile.
  const isReviewSection =
    currentTab === "toReview" || currentTab === "reviewed";
  const reviewTriggerValue: MyEventsTab = isReviewSection
    ? currentTab
    : "toReview";
  const [reviewMenuOpen, setReviewMenuOpen] = useState(false);
  // Radix's Tabs.Trigger only calls onValueChange when a click actually
  // changes the selected value -- clicking an already-selected trigger is a
  // no-op that never reaches handleTabChange. This ref is how the review
  // trigger's onClick (which fires on *every* click, changed or not) tells
  // those two cases apart: true means "this click just switched the tab",
  // so a still-true ref combined with isReviewSection means "this click was
  // a genuine re-click on the already-active tab" -> open the switcher.
  const tabJustChangedRef = useRef(false);

  function handleTabChange(value: string) {
    if (!isMyEventsTab(value)) return;
    tabJustChangedRef.current = true;

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

  function selectReviewTab(value: "toReview" | "reviewed") {
    // Bypasses handleTabChange's reselect-detection above (this always
    // comes from the switcher menu, never from the trigger itself) and just
    // performs the tab change directly.
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    setReviewMenuOpen(false);
  }

  return (
    // Manual activation mode: with the default ("automatic"), arrow-key
    // focus alone would select a tab and trigger its data fetch -- manual
    // matches the WAI-ARIA APG recommendation for tabs whose panels fetch
    // data (every tab here does), requiring an explicit click/Enter/Space.
    <Tabs
      value={currentTab}
      onValueChange={handleTabChange}
      activationMode="manual"
    >
      {/* Down from 5 tabs to 4 (Reviewed now lives behind the combined
          review trigger below) — the horizontally scrollable strip stays as
          a fallback for very narrow screens or long translated labels, but
          no longer needs to scroll just to reach Reviewed. Same
          overflow-x-auto/scrollbar-hide idiom as CategoryChipsRow.tsx. */}
      <div className="overflow-x-auto scrollbar-hide -mx-2 px-2 md:mx-0 md:px-0 md:flex md:justify-center">
        <TabsList className="flex w-max md:w-auto gap-0.5 md:gap-1 bg-muted p-1 rounded-lg">
          <TabsTrigger
            className="shrink-0 grow-0 px-2 md:px-3 text-[13px] md:text-sm"
            value="active"
          >
            Active ({counts.active})
          </TabsTrigger>
          <TabsTrigger
            className="shrink-0 grow-0 px-2 md:px-3 text-[13px] md:text-sm"
            value="cancelled"
          >
            Cancelled ({counts.cancelled})
          </TabsTrigger>
          <TabsTrigger
            className="shrink-0 grow-0 px-2 md:px-3 text-[13px] md:text-sm"
            value="refunds"
          >
            Refunds ({counts.refunds})
          </TabsTrigger>

          <Popover open={reviewMenuOpen} onOpenChange={setReviewMenuOpen}>
            {/* PopoverAnchor, not PopoverTrigger: a Trigger always toggles
                `open` on every click, which can't tell "just switched into
                this tab" apart from "re-clicked it while already active" --
                that's what the onClick handler below (paired with
                tabJustChangedRef) does instead. The Anchor only provides
                positioning. */}
            <PopoverAnchor asChild>
              <TabsTrigger
                className="shrink-0 grow-0 gap-1 px-2 md:px-3 text-[13px] md:text-sm"
                value={reviewTriggerValue}
                aria-haspopup={isReviewSection ? "menu" : undefined}
                aria-expanded={isReviewSection ? reviewMenuOpen : undefined}
                onClick={() => {
                  // A click always fires, whether or not it changed the
                  // selected tab. If it did (tabJustChangedRef is true, set
                  // by handleTabChange a moment ago), this was the click
                  // that entered the review section -- nothing more to do.
                  // If it didn't (still false), this was a re-click on the
                  // already-active tab -- open the switcher.
                  if (isReviewSection && !tabJustChangedRef.current) {
                    setReviewMenuOpen((open) => !open);
                  }
                  tabJustChangedRef.current = false;
                }}
              >
                {currentTab === "reviewed"
                  ? `Reviewed (${reviewedCount})`
                  : `To Review (${toReviewCount})`}
                {isReviewSection && (
                  <IoChevronDown
                    aria-hidden
                    className={cn(
                      "transition-transform",
                      reviewMenuOpen && "rotate-180",
                    )}
                  />
                )}
              </TabsTrigger>
            </PopoverAnchor>
            <PopoverContent align="center" className="w-48 p-1">
              <button
                type="button"
                onClick={() => selectReviewTab("toReview")}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
                  currentTab === "toReview" && "bg-accent font-medium",
                )}
              >
                To Review ({toReviewCount})
              </button>
              <button
                type="button"
                onClick={() => selectReviewTab("reviewed")}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent",
                  currentTab === "reviewed" && "bg-accent font-medium",
                )}
              >
                Reviewed ({reviewedCount})
              </button>
            </PopoverContent>
          </Popover>
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
        <ReviewedTabContent />
      </TabsContent>
    </Tabs>
  );
}
