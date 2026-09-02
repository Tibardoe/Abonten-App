import {
  type BookingFilter,
  flattenBookings,
  usePlaceBookings,
  useRespondToPlaceBooking,
} from "@/features/organizer/usePlaceBookingsReviews";
import type { BookingStatus, OwnerPlaceBooking } from "@abonten/api-client";
import { formatSingleDateTime } from "@abonten/core/dateFormatter";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";

// Per-place booking requests + accept/decline — the native mirror of the
// web ManagePlaceBookingsSection. Accept is a direct tap; Decline is
// confirmed first (web uses a ConfirmDeleteModal). Only `pending` rows are
// respondable.

const FILTERS: { id: BookingFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "declined", label: "Declined" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

const BADGE_CLASS: Record<BookingStatus, string> = {
  pending: "bg-warning/10",
  accepted: "bg-primary/10",
  declined: "bg-destructive/10",
  cancelled: "bg-muted",
};

const BADGE_TEXT_CLASS: Record<BookingStatus, string> = {
  pending: "text-warning",
  accepted: "text-primary",
  declined: "text-destructive",
  cancelled: "text-muted-foreground",
};

function BookingRow({
  booking,
  placeId,
}: {
  booking: OwnerPlaceBooking;
  placeId: string;
}) {
  const respond = useRespondToPlaceBooking(placeId);
  const { date, time } = formatSingleDateTime(booking.requested_time);
  const customer = booking.user_info?.username ?? "A customer";

  const send = (decision: "accept" | "decline") => {
    respond.mutate(
      { bookingId: booking.id, decision },
      {
        onSuccess: (res) => {
          if (res.status !== 200) {
            Alert.alert("Couldn't update", res.message);
          }
        },
        onError: () =>
          Alert.alert("Couldn't update", "Please try again in a moment."),
      },
    );
  };

  const confirmDecline = () => {
    Alert.alert(
      "Decline this booking request?",
      `Decline this booking request from ${customer}?`,
      [
        { text: "Keep request", style: "cancel" },
        {
          text: "Decline request",
          style: "destructive",
          onPress: () => send("decline"),
        },
      ],
    );
  };

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-bold text-foreground">{customer}</Text>
          <Text className="text-sm text-muted-foreground">
            {date} at {time}
          </Text>
          {booking.place_service?.name ? (
            <Text className="text-sm text-muted-foreground">
              Service: {booking.place_service.name}
            </Text>
          ) : null}
          {booking.party_size != null ? (
            <Text className="text-sm text-muted-foreground">
              Party size: {booking.party_size}
            </Text>
          ) : null}
          {booking.note ? (
            <Text className="mt-1 text-sm text-foreground">
              &ldquo;{booking.note}&rdquo;
            </Text>
          ) : null}
        </View>

        <View
          className={`shrink-0 rounded-full px-2.5 py-1 ${BADGE_CLASS[booking.status]}`}
        >
          <Text
            className={`text-xs font-semibold capitalize ${BADGE_TEXT_CLASS[booking.status]}`}
          >
            {booking.status}
          </Text>
        </View>
      </View>

      {booking.status === "pending" ? (
        <View className="flex-row gap-2 pt-1">
          <Pressable
            disabled={respond.isPending}
            onPress={() => send("accept")}
            className="rounded-md bg-primary px-3 py-1.5 active:opacity-90 disabled:opacity-60"
          >
            <Text className="text-sm font-semibold text-primary-foreground">
              {respond.isPending ? "Working…" : "Accept"}
            </Text>
          </Pressable>
          <Pressable
            disabled={respond.isPending}
            onPress={confirmDecline}
            className="rounded-md border border-border px-3 py-1.5 active:opacity-70 disabled:opacity-60"
          >
            <Text className="text-sm text-foreground">Decline</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export default function PlaceBookingsScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const id = placeId ?? "";
  const [filter, setFilter] = useState<BookingFilter>("pending");
  const q = usePlaceBookings(id, filter);

  const rows = flattenBookings(q.data?.pages);
  const firstPage = q.data?.pages[0];
  const failed = q.isError || (firstPage && firstPage.status >= 400);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  return (
    <FlatList
      className="flex-1 bg-background"
      data={rows}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => <BookingRow booking={item} placeId={id} />}
      contentContainerClassName="gap-2 p-4 pb-16"
      ListHeaderComponent={
        <View className="mb-2 gap-3">
          <Text className="text-xl font-bold text-foreground">Bookings</Text>
          <View className="flex-row flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = filter === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFilter(f.id)}
                  className={`rounded-full border px-3 py-1.5 ${
                    active
                      ? "border-primary bg-primary"
                      : "border-border bg-transparent"
                  }`}
                >
                  <Text
                    className={
                      active
                        ? "text-xs font-semibold text-primary-foreground"
                        : "text-xs text-muted-foreground"
                    }
                  >
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
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
        q.isLoading ? (
          <ActivityIndicator className="mt-10" />
        ) : (
          <Text className="mt-10 text-center text-sm text-muted-foreground">
            {failed
              ? firstPage && firstPage.status === 403
                ? "You're not authorized to manage this place."
                : "Couldn't load bookings."
              : `No ${filter === "all" ? "" : `${filter} `}bookings.`}
          </Text>
        )
      }
      ListFooterComponent={
        q.isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null
      }
    />
  );
}
