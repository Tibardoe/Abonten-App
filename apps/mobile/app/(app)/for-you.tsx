import { AppHeader } from "@/components/app/AppHeader";
import {
  useDismissRecommendation,
  useRecommendations,
} from "@/features/alerts/useAlerts";
import { api } from "@/lib/api";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import type { RecommendationItem } from "@abonten/types/discoveryType";
import {
  AppText,
  EmptyState,
  Icon,
  Refresher,
  Skeleton,
} from "@abonten/ui-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { FlatList, Pressable, View } from "react-native";

// "For you": live picks from the last 30 days that are still worth showing.
// Every card says why it is here and can be dismissed with "Not interested",
// which also tunes what comes next.

function PickRow({
  item,
  onDismiss,
}: {
  item: RecommendationItem;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const isEvent = item.subjectType === "event" && item.event;
  const title = isEvent ? item.event?.title : item.place?.name;
  const imageId = isEvent
    ? item.event?.flyerPublicId
    : item.place?.coverPublicId;
  const imageVersion = isEvent
    ? item.event?.flyerVersion
    : item.place?.coverVersion;
  const meta = (
    isEvent
      ? [
          item.event?.startsAt
            ? formatDateWithSuffix(item.event.startsAt)
            : null,
          item.event?.address,
        ]
      : [item.place?.category, item.place?.address]
  )
    .filter(Boolean)
    .join(" · ");

  const open = () => {
    api.recommendations
      .opened(item.subjectType, item.subjectId)
      .catch(() => {});
    router.push(
      isEvent
        ? `/(app)/event/${item.subjectId}`
        : `/(app)/place/${item.subjectId}`,
    );
  };

  return (
    <View className="flex-row gap-3 rounded-2xl border border-border bg-card p-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${title}`}
        onPress={open}
      >
        <View className="h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-xl bg-muted">
          <Icon
            name={isEvent ? "calendar-outline" : "storefront-outline"}
            size={24}
            tone="muted"
          />
          {imageId ? (
            <Image
              source={{
                uri: buildCloudinaryUrl(imageId, imageVersion ?? undefined, {
                  width: 112,
                  height: 112,
                }),
              }}
              style={{ position: "absolute", width: 88, height: 88 }}
              contentFit="cover"
            />
          ) : null}
        </View>
      </Pressable>
      <View className="flex-1 gap-1">
        <AppText variant="caption" tone="brand" className="font-semibold">
          {item.reasonLabel}
        </AppText>
        <Pressable accessibilityRole="button" onPress={open}>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {title}
          </AppText>
        </Pressable>
        {meta ? (
          <AppText variant="meta" numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDismiss}
          className="mt-auto self-start"
        >
          <AppText variant="small" tone="muted">
            Not interested
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

export default function ForYou() {
  const router = useRouter();
  const recs = useRecommendations();
  const dismiss = useDismissRecommendation();
  const items = recs.data ?? [];

  return (
    <View className="flex-1 bg-background">
      <AppHeader variant="title" title="For you" backFallback="/(app)/(tabs)" />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerClassName="gap-3 p-4 pb-16"
        refreshControl={
          <Refresher
            refreshing={recs.isRefetching}
            onRefresh={() => recs.refetch()}
          />
        }
        renderItem={({ item }) => (
          <PickRow item={item} onDismiss={() => dismiss.mutate(item)} />
        )}
        ListEmptyComponent={
          recs.isLoading ? (
            <View className="gap-3">
              {["a", "b", "c"].map((k) => (
                <Skeleton key={k} width="100%" height={112} radius={16} />
              ))}
            </View>
          ) : recs.isError ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load your picks"
              description="Check your connection and try again."
              actionLabel="Try again"
              onAction={() => recs.refetch()}
            />
          ) : (
            <EmptyState
              icon="sparkles-outline"
              title="No picks yet"
              description="Turn on alerts after you get a ticket, or tap Notify me on organizers and places you like."
              actionLabel="Manage notifications"
              onAction={() => router.push("/(app)/settings/notifications")}
            />
          )
        }
        ListFooterComponent={
          items.length > 0 ? (
            <Pressable
              onPress={() => router.push("/(app)/settings/notifications")}
              className="items-center pt-2"
            >
              <AppText variant="small" tone="brand">
                Manage notifications
              </AppText>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}
