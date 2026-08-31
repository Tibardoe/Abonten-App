import { TicketCard } from "@/components/TicketCard";
import { useMyTickets } from "@/features/tickets/useMyTickets";
import type { UserTicketType } from "@abonten/types/ticketType";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from "react-native";

export default function Tickets() {
  const q = useMyTickets();

  const tickets: UserTicketType[] =
    q.data?.pages.flatMap((p) => p.tickets) ?? [];

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  return (
    <View className="flex-1 bg-background">
      <Text className="px-4 pb-2 pt-16 text-2xl font-bold text-foreground">
        My tickets
      </Text>

      {q.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
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
            <Text className="mt-10 text-center text-sm text-muted-foreground">
              {q.isError ? "Couldn't load tickets." : "No tickets yet."}
            </Text>
          }
          ListFooterComponent={
            q.isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null
          }
        />
      )}
    </View>
  );
}
