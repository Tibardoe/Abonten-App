import { TicketCard } from "@/components/TicketCard";
import { useMyTickets } from "@/features/tickets/useMyTickets";
import type { UserTicketType } from "@abonten/types/ticketType";
import { EmptyState, ScreenLoader, Spinner } from "@abonten/ui-native";
import { useCallback } from "react";
import { FlatList, RefreshControl, View } from "react-native";

export default function Tickets() {
  const q = useMyTickets();

  const tickets: UserTicketType[] =
    q.data?.pages.flatMap((p) => p.tickets) ?? [];

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  if (q.isLoading) return <ScreenLoader />;

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={tickets}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <TicketCard ticket={item} />}
        contentContainerClassName="gap-3 px-4 pb-16 pt-4"
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
            title={q.isError ? "Couldn't load tickets" : "No tickets yet"}
            description={
              q.isError
                ? "Pull down to try again."
                : "Tickets you buy will show up here."
            }
          />
        }
        ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : null}
      />
    </View>
  );
}
