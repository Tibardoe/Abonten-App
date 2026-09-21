import { TicketCard } from "@/components/TicketCard";
import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { PendingCheckoutsSection } from "@/components/checkout/PendingCheckoutsSection";
import { EventsToReviewList } from "@/components/reviews/EventsToReviewList";
import { ReviewedEventsList } from "@/components/reviews/ReviewedEventsList";
import { TicketListSkeleton } from "@/components/skeletons";
import {
  type TicketFilter,
  useMyTickets,
} from "@/features/tickets/useMyTickets";
import { useQueryView } from "@/lib/useQueryView";
import type { UserTicketType } from "@abonten/types/ticketType";
import {
  EmptyState,
  Refresher,
  SegmentedTabs,
  Spinner,
} from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, View } from "react-native";

// My Tickets — a pushed screen (Account › My Tickets, the menu, payment
// success, ticket notifications). It was a bottom tab until Spotlight took
// that slot.
//
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

  const view = useQueryView(q, () => tickets.length === 0);

  if (view.kind === "loading") return <TicketListSkeleton />;

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
      refreshControl={<Refresher onRefresh={() => q.refetch()} />}
      ListEmptyComponent={
        view.kind === "empty" ? (
          <EmptyState
            icon="receipt-outline"
            title={EMPTY_COPY[tab].title}
            description={EMPTY_COPY[tab].description}
          />
        ) : (
          // Tickets are never written to disk (they carry a QR code and
          // money), so offline this is honest about why they aren't here.
          <QueryUnavailable
            view={view}
            subject="your tickets"
            onRetry={() => q.refetch()}
          />
        )
      }
      ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : null}
    />
  );
}

export default function Tickets() {
  const t = useTranslations("navigation");
  const [section, setSection] = useState<Section>("tickets");
  // A notification can open a section directly (`?section=cancelled` from
  // "Event cancelled").
  const { section: requested } = useLocalSearchParams<{ section?: string }>();
  useEffect(() => {
    if (requested === "cancelled" || requested === "refunds") {
      setSection(requested);
    }
  }, [requested]);
  const [ticketsSub, setTicketsSub] = useState<TicketsSub>("active");
  const [reviewSub, setReviewSub] = useState<ReviewSub>("toReview");

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="detail" title={t("myEvents")} backFallback="/(app)" />
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
