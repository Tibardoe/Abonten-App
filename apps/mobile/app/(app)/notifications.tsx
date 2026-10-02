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
import { translatorFor, useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Pressable, SectionList, View } from "react-native";

const DAYS = ["today", "yesterday", "earlier"] as const;
type Day = (typeof DAYS)[number];

type Section = { day: Day; data: NotificationType[] };

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// Today / Yesterday / Earlier — the grouping is derived, not stored, so it
// always reflects "now".
function groupByDay(items: NotificationType[]): Section[] {
  const today = startOfDay(new Date());
  const yesterday = today - 86_400_000;
  // Sorted by what the day IS; its name is chosen where it is shown. The
  // buckets were once filled under English names and read back under the
  // translated ones, so the screen crashed in every other language.
  const buckets: Record<Day, NotificationType[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };
  for (const n of items) {
    const day = startOfDay(new Date(n.created_at));
    if (day >= today) buckets.today.push(n);
    else if (day >= yesterday) buckets.yesterday.push(n);
    else buckets.earlier.push(n);
  }
  return DAYS.filter((day) => buckets[day].length > 0).map((day) => ({
    day,
    data: buckets[day],
  }));
}

export default function Notifications() {
  const t = useTranslations("notifications");

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
        title={t("notifications")}
        backFallback="/(app)/account"
        rightAccessory={
          hasUnread ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("markAllRead")}
              hitSlop={8}
              onPress={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="px-2 active:opacity-60"
            >
              <AppText variant="small" tone="brand" className="font-medium">
                {t("markAllRead")}
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
              {t(section.day)}
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
                title={t("noNotificationsYet")}
                description={t("updatesAboutYourTicketsEventsAnd")}
              />
            ) : (
              <QueryUnavailable
                view={view}
                subject={t("yourNotifications")}
                onRetry={() => q.refetch()}
              />
            )
          }
          ListFooterComponent={
            <ListFooter
              count={items.length}
              isFetchingNextPage={q.isFetchingNextPage}
              hasNextPage={q.hasNextPage}
              isError={q.isFetchNextPageError}
              onRetry={() => q.fetchNextPage()}
            />
          }
        />
      )}
    </View>
  );
}
