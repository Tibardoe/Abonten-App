import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { NotificationsSkeleton } from "@/components/skeletons";
import { notificationTarget } from "@/features/notifications/notificationLink";
import {
  flattenNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/features/notifications/useNotifications";
import { useQueryView } from "@/lib/useQueryView";
import type { NotificationType } from "@abonten/types/notificationType";
import { AppText, EmptyState, ListFooter, Refresher } from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Pressable, SectionList, View } from "react-native";

type Section = { title: string; data: NotificationType[] };

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Today / Yesterday / Earlier — the grouping is derived, not stored, so it
// always reflects "now".
function groupByDay(items: NotificationType[]): Section[] {
  const today = startOfDay(new Date());
  const yesterday = today - 86_400_000;
  const buckets: Record<string, NotificationType[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
  };
  for (const n of items) {
    const day = startOfDay(new Date(n.created_at));
    if (day >= today) buckets.Today.push(n);
    else if (day >= yesterday) buckets.Yesterday.push(n);
    else buckets.Earlier.push(n);
  }
  return (["Today", "Yesterday", "Earlier"] as const)
    .filter((k) => buckets[k].length > 0)
    .map((k) => ({ title: k, data: buckets[k] }));
}

export default function Notifications() {
  const router = useRouter();
  const q = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const markOne = useMarkNotificationRead();

  const items = flattenNotifications(q.data?.pages);
  const sections = useMemo(() => groupByDay(items), [items]);
  const hasUnread = items.some((i) => !i.read_at);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  // Mark unread rows read on tap, then navigate to whatever the notification
  // points at (prefers the structured `data`, falls back to the `link`).
  // An unrecognised / removed target just marks read — never a broken screen.
  const openRow = useCallback(
    (item: NotificationType) => {
      if (!item.read_at) markOne.mutate(item.id);
      const href = notificationTarget(item);
      if (href) router.push(href);
    },
    [markOne, router],
  );

  // Loading / offline / failed vs "nothing has happened yet".
  const view = useQueryView(q, () => items.length === 0);

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

      {view.kind === "loading" ? (
        <NotificationsSkeleton />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.id}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <AppText variant="overline" className="px-4 pb-1.5 pt-4">
              {section.title}
            </AppText>
          )}
          renderItem={({ item }) => (
            <View className="px-4 pb-2">
              <NotificationItem item={item} onPress={() => openRow(item)} />
            </View>
          )}
          contentContainerClassName="pb-16"
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          refreshControl={<Refresher onRefresh={() => q.refetch()} />}
          ListEmptyComponent={
            view.kind === "empty" ? (
              <EmptyState
                icon="notifications-outline"
                title="No notifications yet"
                description="Updates about your tickets, events and messages show up here."
              />
            ) : (
              <QueryUnavailable
                view={view}
                subject="your notifications"
                onRetry={() => q.refetch()}
              />
            )
          }
          ListFooterComponent={
            <ListFooter
              count={items.length}
              isFetchingNextPage={q.isFetchingNextPage}
              hasNextPage={q.hasNextPage}
              isError={q.isError}
              onRetry={() => q.fetchNextPage()}
            />
          }
        />
      )}
    </View>
  );
}
