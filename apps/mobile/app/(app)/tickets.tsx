import { TicketCard } from "@/components/TicketCard";
import { EventsToReviewList } from "@/components/reviews/EventsToReviewList";
import { ReviewedEventsList } from "@/components/reviews/ReviewedEventsList";
import {
  type TicketFilter,
  useMyTickets,
} from "@/features/tickets/useMyTickets";
import type { UserTicketType } from "@abonten/types/ticketType";
import { Chip, EmptyState, ScreenLoader, Spinner } from "@abonten/ui-native";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";

// Native echo of the full web /manage/my-events tab set. The web strip
// compresses to four slots with popover switchers to avoid horizontal
// scroll; on native a horizontally-scrolling chip row is the idiomatic
// equivalent, so all six live inline.
type TicketsTab = TicketFilter | "toReview" | "reviewed";

const TABS: { key: TicketsTab; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
  { key: "refunds", label: "Refunds" },
  { key: "toReview", label: "To Review" },
  { key: "reviewed", label: "Reviewed" },
];

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
      contentContainerClassName="gap-3 px-4 pb-16"
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
  const [tab, setTab] = useState<TicketsTab>("active");

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4 py-3"
      >
        {TABS.map((t) => (
          <Chip
            key={t.key}
            label={t.label}
            selected={tab === t.key}
            onPress={() => setTab(t.key)}
          />
        ))}
      </ScrollView>

      {tab === "toReview" ? (
        <EventsToReviewList />
      ) : tab === "reviewed" ? (
        <ReviewedEventsList />
      ) : (
        <TicketFilterList tab={tab} />
      )}
    </View>
  );
}
