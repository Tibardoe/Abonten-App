import { EventCard } from "@/components/EventCard";
import { useDeviceLocation } from "@/features/discovery/useDeviceLocation";
import { useNearbyEvents } from "@/features/discovery/useNearbyEvents";
import type { UserPostType } from "@abonten/types/postsType";
import {
  Caption,
  EmptyState,
  ScreenLoader,
  SectionTitle,
  Spinner,
} from "@abonten/ui-native";
import { useCallback } from "react";
import { FlatList, RefreshControl, View } from "react-native";

export default function Home() {
  const { location } = useDeviceLocation();
  const q = useNearbyEvents(location);

  const events: UserPostType[] =
    q.data?.pages.flatMap((p) => p.rows as UserPostType[]) ?? [];

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  if (q.isLoading) return <ScreenLoader />;

  return (
    <View className="flex-1 bg-background">
      <View className="gap-1 px-4 pb-2 pt-4">
        <SectionTitle>Nearby events</SectionTitle>
        {location?.isFallback ? (
          <Caption>
            Showing Accra — enable location for events near you.
          </Caption>
        ) : null}
      </View>

      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EventCard event={item} />}
        contentContainerClassName="gap-4 px-4 pb-16"
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
            icon="calendar-outline"
            title={q.isError ? "Couldn't load events" : "No events nearby"}
            description={
              q.isError
                ? "Pull down to try again."
                : "Check back soon, or search for an event."
            }
          />
        }
        ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : null}
      />
    </View>
  );
}
