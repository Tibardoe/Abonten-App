import {
  flattenNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/features/notifications/useNotifications";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import type { NotificationType } from "@abonten/types/notificationType";
import { EmptyState, ScreenLoader, Spinner } from "@abonten/ui-native";
import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";

function Row({
  item,
  onPress,
}: {
  item: NotificationType;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="gap-1 rounded-lg border border-border bg-card p-3 active:opacity-80"
    >
      <View className="flex-row items-center gap-2">
        {item.read_at ? null : (
          <View className="h-2 w-2 rounded-full bg-primary" />
        )}
        <Text
          className="flex-1 text-sm font-semibold text-foreground"
          numberOfLines={1}
        >
          {item.title}
        </Text>
      </View>
      {item.body ? (
        <Text className="text-xs text-muted-foreground" numberOfLines={2}>
          {item.body}
        </Text>
      ) : null}
      <Text className="text-[10px] text-muted-foreground">
        {formatDateWithSuffix(item.created_at)}
      </Text>
    </Pressable>
  );
}

export default function Notifications() {
  const q = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();

  const items = flattenNotifications(q.data?.pages);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  if (q.isLoading) return <ScreenLoader />;

  return (
    <View className="flex-1 bg-background">
      {items.some((i) => !i.read_at) ? (
        <View className="flex-row justify-end px-4 pb-1 pt-3">
          <Pressable
            onPress={() => markAll.mutate()}
            disabled={markAll.isPending}
          >
            <Text className="text-sm font-medium text-primary disabled:opacity-40">
              Mark all read
            </Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <Row item={item} onPress={() => markOne.mutate(item.id)} />
        )}
        contentContainerClassName="gap-3 px-4 pb-16 pt-2"
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
            icon="notifications-outline"
            title={
              q.isError ? "Couldn't load notifications" : "No notifications yet"
            }
            description={
              q.isError
                ? "Pull down to try again."
                : "Updates about your tickets and events show up here."
            }
          />
        }
        ListFooterComponent={q.isFetchingNextPage ? <Spinner /> : null}
      />
    </View>
  );
}
