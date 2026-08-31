import {
  flattenNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/features/notifications/useNotifications";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import type { NotificationType } from "@abonten/types/notificationType";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

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

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-16">
        <Text className="text-2xl font-bold text-foreground">
          Notifications
        </Text>
        <Pressable
          onPress={() => markAll.mutate()}
          disabled={markAll.isPending || items.every((i) => i.read_at)}
        >
          <Text className="text-sm text-primary disabled:opacity-40">
            Mark all read
          </Text>
        </Pressable>
      </View>

      {q.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => (
            <Row item={item} onPress={() => markOne.mutate(item.id)} />
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
            <Text className="mt-10 text-center text-sm text-muted-foreground">
              {q.isError ? "Couldn't load notifications." : "Nothing yet."}
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
