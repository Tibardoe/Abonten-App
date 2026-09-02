import { TicketCard } from "@/components/TicketCard";
import { PendingCheckoutsSection } from "@/components/checkout/PendingCheckoutsSection";
import { EventsToReviewList } from "@/components/reviews/EventsToReviewList";
import { ReviewedEventsList } from "@/components/reviews/ReviewedEventsList";
import {
  type TicketFilter,
  useMyTickets,
} from "@/features/tickets/useMyTickets";
import type { UserTicketType } from "@abonten/types/ticketType";
import {
  EmptyState,
  ScreenLoader,
  SegmentedTabs,
  Spinner,
} from "@abonten/ui-native";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";

// Native echo of the web /manage/my-events tab set. The web strip is a
// 4-column segmented control where "Active/Past" and "To review/Reviewed"
// each share one slot behind a popover switcher; on mobile the switcher is
// an inline sub-toggle under the strip, which reads better on a phone.

type Section = "tickets" | "cancelled" | "refunds" | "review";
type TicketsSub = "active" | "past";
type ReviewSub = "toReview" | "reviewed";

const EMPTY_COPY: Record<TicketFilter, { title: string; description: string }> =
  {
    active: {
      title: "No active tickets",
      description: "Tickets you buy will show up here.",
    },
    past: {
      title: "No past tickets",
      description: "Tickets for events that have ended or were cancelled.",
    },
    cancelled: {
      title: "No cancelled tickets",
      description: "Cancelled tickets show up here.",
    },
    refunds: {
      title: "No refunds yet",
      description:
        "Refunds for cancelled paid tickets will appear here when applicable.",
    },
  };

function TicketFilterList({ tab }: { tab: TicketFilter }) {
  const q = useMyTickets(tab);
  const tickets: UserTicketType[] =
    q.data?.pages.flatMap((p) => p.tickets) ?? [];

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  if (q.isLoading) return <ScreenLoader />;

  return (
    <FlatList
      data={tickets}
      keyExtractor={(t) => t.id}
      renderItem={({ item }) => (
        <TicketCard ticket={item} showRefundInfo={tab === "refunds"} />
      )}
      ListHeaderComponent={
        tab === "active" ? <PendingCheckoutsSection /> : null
      }
      contentContainerClassName="gap-3 px-4 pb-16 pt-3"
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={() => q.refetch()}
        />
      }
      ListEmptyComponent={
        <EmptyState
          icon="receipt-outline"
          title={q.isError ? "Couldn't load tickets" : EMPTY_COPY[tab].title}
          description={
            q.isError ? "Pull down to try again." : EMPTY_COPY[tab].description
          }
        />
      }
      ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : null}
    />
  );
}

export default function Tickets() {
  const [section, setSection] = useState<Section>("tickets");
  const [ticketsSub, setTicketsSub] = useState<TicketsSub>("active");
  const [reviewSub, setReviewSub] = useState<ReviewSub>("toReview");

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 pb-1 pt-3">
        <SegmentedTabs
          options={[
            {
              key: "tickets",
              label: ticketsSub === "past" ? "Past" : "Active",
            },
            { key: "cancelled", label: "Cancelled" },
            { key: "refunds", label: "Refunds" },
            {
              key: "review",
              label: reviewSub === "reviewed" ? "Reviewed" : "To review",
            },
          ]}
          value={section}
          onChange={setSection}
        />
      </View>

      {section === "tickets" ? (
        <View className="px-4 pb-1">
          <SegmentedTabs
            options={[
              { key: "active", label: "Active" },
              { key: "past", label: "Past" },
            ]}
            value={ticketsSub}
            onChange={setTicketsSub}
            className="h-9"
          />
        </View>
      ) : null}

      {section === "review" ? (
        <View className="px-4 pb-1">
          <SegmentedTabs
            options={[
              { key: "toReview", label: "To review" },
              { key: "reviewed", label: "Reviewed" },
            ]}
            value={reviewSub}
            onChange={setReviewSub}
            className="h-9"
          />
        </View>
      ) : null}

      {section === "review" ? (
        reviewSub === "toReview" ? (
          <EventsToReviewList />
        ) : (
          <ReviewedEventsList />
        )
      ) : (
        <TicketFilterList tab={section === "tickets" ? ticketsSub : section} />
      )}
    </View>
  );
}
