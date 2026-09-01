import { TicketCard } from "@/components/TicketCard";
import {
  type TicketFilter,
  useMyTickets,
} from "@/features/tickets/useMyTickets";
import type { UserTicketType } from "@abonten/types/ticketType";
import { Chip, EmptyState, ScreenLoader, Spinner } from "@abonten/ui-native";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";

// Native echo of the web /manage/my-events tab set. Active / Past /
// Cancelled ship now; Refunds / To Review / Reviewed are a later pass
// (they need the transaction-refund join and the attendance-gated review
// flow — docs/mobile/09).
const TABS: { key: TicketFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
];

const EMPTY_COPY: Record<TicketFilter, string> = {
  active: "No active tickets",
  past: "No past tickets",
  cancelled: "No cancelled tickets",
};

export default function Tickets() {
  const [tab, setTab] = useState<TicketFilter>("active");
  const q = useMyTickets(tab);

  const tickets: UserTicketType[] =
    q.data?.pages.flatMap((p) => p.tickets) ?? [];

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

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

      {q.isLoading ? (
        <ScreenLoader />
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => <TicketCard ticket={item} />}
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
              title={q.isError ? "Couldn't load tickets" : EMPTY_COPY[tab]}
              description={
                q.isError
                  ? "Pull down to try again."
                  : "Tickets you buy will show up here."
              }
            />
          }
          ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : null}
        />
      )}
    </View>
  );
}
