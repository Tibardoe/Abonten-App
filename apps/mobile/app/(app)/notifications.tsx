import { AppHeader } from "@/components/app/AppHeader";
import { NotificationsSkeleton } from "@/components/skeletons";
import { notificationHref } from "@/features/notifications/notificationLink";
import {
  flattenNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/features/notifications/useNotifications";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import type { NotificationType } from "@abonten/types/notificationType";
import { AppText, EmptyState, Spinner } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";

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
      className="gap-1 rounded-xl border border-border bg-card p-3 active:opacity-80"
    >
      <View className="flex-row items-center gap-2">
        {item.read_at ? null : (
          <View className="h-2 w-2 rounded-full bg-primary" />
        )}
        <AppText variant="bodyStrong" className="flex-1" numberOfLines={1}>
          {item.title}
        </AppText>
      </View>
      {item.body ? (
        <AppText variant="meta" numberOfLines={2}>
          {item.body}
        </AppText>
      ) : null}
      <AppText variant="caption">
        {formatDateWithSuffix(item.created_at)}
      </AppText>
    </Pressable>
  );
}

export default function Notifications() {
  const router = useRouter();
  const q = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();

  const items = flattenNotifications(q.data?.pages);
  const hasUnread = items.some((i) => !i.read_at);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  // Same as the web NotificationBell row: mark unread rows read on tap, then
  // navigate to whatever the notification points at (event / place /
  // organizer screen / edit profile). Unknown links just mark read.
  const openRow = useCallback(
    (item: NotificationType) => {
      if (!item.read_at) markOne.mutate(item.id);
      const href = notificationHref(item.link);
      if (href) router.push(href);
    },
    [markOne, router],
  );

  return (
    <View className="flex-1 bg-background">
      <AppHeader
        variant="title"
        title="Notifications"
        backFallback="/(app)/account"
        rightAccessory={
          hasUnread ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mark all read"
              hitSlop={8}
              onPress={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="px-2 active:opacity-60"
            >
              <AppText variant="small" tone="brand" className="font-medium">
                Mark all read
              </AppText>
            </Pressable>
          ) : null
        }
      />

      {q.isLoading ? (
        <NotificationsSkeleton />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={({ item }) => (
            <Row item={item} onPress={() => openRow(item)} />
          )}
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
              icon="notifications-outline"
              title={
                q.isError
                  ? "Couldn't load notifications"
                  : "No notifications yet"
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
      )}
    </View>
  );
}
