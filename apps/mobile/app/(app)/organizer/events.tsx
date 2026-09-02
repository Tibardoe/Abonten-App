import {
  flattenOrganizerEvents,
  useOrganizerEvents,
} from "@/features/organizer/useOrganizer";
import type { UserPostType } from "@abonten/api-client";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { AppText } from "@abonten/ui-native";
import { Image } from "expo-image";
import { Link, useRouter } from "expo-router";
import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";

const STATUS_LABEL: Record<string, string> = {
  published: "Published",
  draft: "Draft",
  canceled: "Canceled",
  cancelled: "Canceled",
  ended: "Ended",
};

// Only draft/published events can be cancelled (the RPC rejects anything
// else); everything else is view-only here.
const CANCELLABLE = new Set(["draft", "published"]);

function OrganizerEventCard({ event }: { event: UserPostType }) {
  const router = useRouter();
  const flyer =
    event.flyer_public_id && event.flyer_version
      ? buildCloudinaryUrl(event.flyer_public_id, event.flyer_version, {
          width: 200,
          height: 200,
        })
      : null;
  const status = event.status ?? "";

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-3">
      <Pressable
        className="flex-row gap-3 active:opacity-90"
        onPress={() => router.push(`/(app)/organizer/events/${event.id}`)}
      >
        {flyer ? (
          <Image
            source={{ uri: flyer }}
            style={{ width: 64, height: 64, borderRadius: 8 }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View className="h-16 w-16 items-center justify-center rounded-lg bg-muted">
            <AppText className="text-[10px] text-muted-foreground">
              No image
            </AppText>
          </View>
        )}
        <View className="flex-1 gap-1">
          <AppText
            className="text-sm font-semibold text-foreground"
            numberOfLines={1}
          >
            {event.title}
          </AppText>
          {event.starts_at ? (
            <AppText variant="muted">
              {formatDateWithSuffix(event.starts_at)}
            </AppText>
          ) : null}
          <View className="mt-0.5 flex-row items-center gap-2">
            <View className="self-start rounded-full bg-muted px-2 py-0.5">
              <AppText className="text-[10px] font-medium uppercase text-muted-foreground">
                {STATUS_LABEL[status] ?? status ?? "—"}
              </AppText>
            </View>
            {event.event_code ? (
              <AppText className="text-[10px] text-muted-foreground">
                {event.event_code}
              </AppText>
            ) : null}
          </View>
        </View>
      </Pressable>

      {CANCELLABLE.has(status) ? (
        <Link
          href={`/(app)/organizer/cancel-event?eventId=${event.id}&title=${encodeURIComponent(
            event.title ?? "",
          )}`}
          asChild
        >
          <Pressable className="self-start px-1 py-1 active:opacity-70">
            <AppText className="text-[13px] font-semibold text-destructive">
              Cancel event
            </AppText>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}

export default function OrganizerEventsScreen() {
  const q = useOrganizerEvents();
  const events = flattenOrganizerEvents(q.data?.pages);
  const failed =
    q.isError || (q.data?.pages[0] && q.data.pages[0].status >= 400);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  if (q.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1 bg-background"
      data={events}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => <OrganizerEventCard event={item} />}
      contentContainerClassName="gap-3 p-4 pb-16"
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={q.isRefetching && !q.isFetchingNextPage}
          onRefresh={() => q.refetch()}
        />
      }
      ListEmptyComponent={
        <AppText className="mt-10 text-center text-sm text-muted-foreground">
          {failed ? "Couldn't load your events." : "You have no events yet."}
        </AppText>
      }
      ListFooterComponent={
        q.isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null
      }
    />
  );
}
