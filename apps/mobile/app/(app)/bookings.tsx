import { AppHeader } from "@/components/app/AppHeader";
import {
  type MyBooking,
  useCancelBooking,
  useMyBookings,
} from "@/features/places/usePlaceBooking";
import { formatFullDateTimeRange } from "@abonten/core/dateFormatter";
import type { BookingStatus } from "@abonten/types/placeBookingType";
import {
  AppText,
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  ScreenError,
  Spinner,
} from "@abonten/ui-native";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert, FlatList, RefreshControl, View } from "react-native";

const STATUS_META: Record<BookingStatus, { tone: BadgeTone; label: string }> = {
  pending: { tone: "warning", label: "Pending" },
  accepted: { tone: "success", label: "Accepted" },
  declined: { tone: "destructive", label: "Declined" },
  cancelled: { tone: "muted", label: "Cancelled" },
};

function BookingRow({
  booking,
  onOpen,
}: {
  booking: MyBooking;
  onOpen: () => void;
}) {
  const cancel = useCancelBooking();
  const meta = STATUS_META[booking.status];
  const canCancel =
    booking.status === "pending" || booking.status === "accepted";
  const when = formatFullDateTimeRange(booking.requested_time, null);

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-start justify-between gap-2">
        <AppText
          variant="bodyStrong"
          className="flex-1"
          numberOfLines={1}
          onPress={onOpen}
        >
          {booking.place?.name ?? "Place"}
        </AppText>
        <Badge tone={meta.tone} label={meta.label} />
      </View>

      <View className="gap-0.5">
        <AppText variant="meta">
          {when.date} · {when.time}
        </AppText>
        {booking.place_service?.name ? (
          <AppText variant="caption">
            Service: {booking.place_service.name}
          </AppText>
        ) : null}
        {booking.party_size ? (
          <AppText variant="caption">Party of {booking.party_size}</AppText>
        ) : null}
        {booking.note ? (
          <AppText variant="caption" numberOfLines={2}>
            “{booking.note}”
          </AppText>
        ) : null}
      </View>

      {canCancel ? (
        <Button
          title={cancel.isPending ? "Cancelling…" : "Cancel booking"}
          variant="outline"
          size="sm"
          disabled={cancel.isPending}
          onPress={() =>
            Alert.alert("Cancel this booking?", "The owner will be notified.", [
              { text: "Keep it", style: "cancel" },
              {
                text: "Cancel booking",
                style: "destructive",
                onPress: () =>
                  cancel.mutate(
                    {
                      placeId: booking.place_id,
                      bookingId: booking.id,
                    },
                    {
                      onSettled: (res) => {
                        if (res && res.status !== 200) {
                          Alert.alert(
                            "Couldn't cancel",
                            res.message ?? "Please try again.",
                          );
                        }
                      },
                    },
                  ),
              },
            ])
          }
        />
      ) : null}
    </View>
  );
}

export default function MyBookingsScreen() {
  const router = useRouter();
  const q = useMyBookings();

  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  const header = (
    <AppHeader variant="title" title="My bookings" backFallback="/(app)" />
  );

  if (q.isLoading) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </View>
    );
  }

  if (q.isError) {
    return (
      <View className="flex-1 bg-background">
        {header}
        <ScreenError
          message="Couldn't load your bookings."
          onRetry={() => q.refetch()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {header}
      <FlatList
        data={rows}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={q.isRefetching && !q.isFetchingNextPage}
            onRefresh={() => q.refetch()}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title="No bookings yet"
            description="When you request a booking at a place, it'll show up here."
          />
        }
        ListFooterComponent={
          q.isFetchingNextPage ? (
            <View className="py-4">
              <Spinner />
            </View>
          ) : rows.length > 0 && !q.hasNextPage ? (
            <AppText variant="caption" className="py-3 text-center">
              That's everything.
            </AppText>
          ) : null
        }
        renderItem={({ item }) => (
          <BookingRow
            booking={item}
            onOpen={() =>
              item.place?.slug
                ? router.push(`/(app)/place/${item.place_id}`)
                : undefined
            }
          />
        )}
      />
    </View>
  );
}
