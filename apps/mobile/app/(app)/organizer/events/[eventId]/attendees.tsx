import {
  flattenAttendees,
  useAttendees,
  useCheckInTicket,
} from "@/features/organizer/useAttendees";
import type { AttendanceRow } from "@abonten/api-client";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

// Per-event attendee list + check-in — the native mirror of the web
// AttendanceListView. Each row flips its ticket between 'active' and 'used';
// an already-checked-in row offers an undo for a mis-tap.

function AttendeeRow({
  attendee,
  eventId,
}: {
  attendee: AttendanceRow;
  eventId: string;
}) {
  const checkIn = useCheckInTicket(eventId);

  const isCancelled = attendee.status === "cancelled";
  const isCheckedIn = attendee.ticket?.status === "used";
  const name =
    attendee.user_info?.full_name ?? attendee.user_info?.username ?? "Attendee";

  const toggle = (checkedIn: boolean) => {
    if (!attendee.ticket_id) return;
    checkIn.mutate(
      { ticketId: attendee.ticket_id, checkedIn },
      {
        onSuccess: (res) => {
          if (res.status !== 200) {
            Alert.alert("Check-in failed", res.message);
          }
        },
        onError: () => {
          Alert.alert("Check-in failed", "Please try again.");
        },
      },
    );
  };

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 font-bold text-foreground" numberOfLines={1}>
          {name}
        </Text>
        <View className="shrink-0 flex-row items-center gap-2">
          {attendee.ticket_type?.type ? (
            <Text className="text-sm text-muted-foreground">
              {attendee.ticket_type.type}
            </Text>
          ) : null}
          <View
            className={
              isCancelled
                ? "rounded-full bg-destructive/10 px-2 py-1"
                : "rounded-full bg-primary/10 px-2 py-1"
            }
          >
            <Text
              className={
                isCancelled
                  ? "text-xs font-semibold text-destructive"
                  : "text-xs font-semibold text-primary"
              }
            >
              {isCancelled ? "Cancelled" : "Active"}
            </Text>
          </View>
        </View>
      </View>

      {attendee.auth?.email ? (
        <Text className="text-sm text-muted-foreground">
          {attendee.auth.email}
        </Text>
      ) : null}
      {attendee.auth?.phone ? (
        <Text className="text-sm text-muted-foreground">
          {attendee.auth.phone}
        </Text>
      ) : null}

      {!isCancelled && attendee.ticket_id ? (
        <View className="pt-1">
          {isCheckedIn ? (
            <Pressable
              disabled={checkIn.isPending}
              onPress={() => toggle(false)}
              className="self-start active:opacity-70 disabled:opacity-50"
            >
              <Text className="text-xs font-semibold text-primary">
                ✓ Checked in — undo
              </Text>
            </Pressable>
          ) : (
            <Pressable
              disabled={checkIn.isPending}
              onPress={() => toggle(true)}
              className="self-start rounded-md bg-primary px-3 py-1.5 active:opacity-90 disabled:opacity-60"
            >
              <Text className="text-xs font-semibold text-primary-foreground">
                {checkIn.isPending ? "Checking in…" : "Check in"}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function EventAttendeesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = eventId ?? "";
  const q = useAttendees(id);
  const rows = flattenAttendees(q.data?.pages);
  const firstPage = q.data?.pages[0];
  const failed = q.isError || (firstPage && firstPage.status >= 400);

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
      data={rows}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <AttendeeRow attendee={item} eventId={id} />}
      contentContainerClassName="gap-2 p-4 pb-16"
      ListHeaderComponent={
        <Text className="mb-1 text-xl font-bold text-foreground">
          Attendees
        </Text>
      }
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
          {failed
            ? firstPage && firstPage.status === 403
              ? "You're not authorized to view this event."
              : "Couldn't load the attendee list."
            : "No attendees yet."}
        </Text>
      }
      ListFooterComponent={
        q.isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null
      }
    />
  );
}
