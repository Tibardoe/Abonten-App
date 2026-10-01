import { AppHeader } from "@/components/app/AppHeader";
import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import {
  type MyBooking,
  useCancelBooking,
  useMyBookings,
} from "@/features/places/usePlaceBooking";
import { useQueryView } from "@/lib/useQueryView";
import { formatFullDateTimeRange } from "@abonten/core/dateFormatter";
import { resolveBookingState } from "@abonten/core/placeBooking";
import type { BookingStatus } from "@abonten/types/placeBookingType";
import {
  AppText,
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  ListFooter,
  Refresher,
  ScreenError,
  Spinner,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert, FlatList, View } from "react-native";

// "Expired" is derived, not stored: a request the owner never answered
// before its date arrived. It used to show as "Pending" with a live "Cancel
// booking" button, so the customer had no way to tell whether to turn up.
type BookingState = BookingStatus | "lapsed";

const STATUS_META: Record<BookingState, { tone: BadgeTone; label: string }> = {
  pending: { tone: "warning", label: "bookingStatus.pending" },
  accepted: { tone: "success", label: "bookingStatus.accepted" },
  declined: { tone: "destructive", label: "bookingStatus.declined" },
  cancelled: { tone: "muted", label: "bookingStatus.cancelled" },
  lapsed: { tone: "muted", label: "bookingStatus.expired" },
};

function BookingRow({
  booking,
  onOpen,
}: {
  booking: MyBooking;
  onOpen: () => void;
}) {
  const { locale } = useLocale();

  const t = useTranslations("places");

  const toast = useToast();
  const cancel = useCancelBooking();
  const state = resolveBookingState(
    booking.status,
    booking.requested_time,
  ) as BookingState;
  const meta = STATUS_META[state];
  const canCancel = state === "pending" || state === "accepted";
  const when = formatFullDateTimeRange(
    booking.requested_time,
    null,
    undefined,
    locale,
  );

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-3">
      <View className="flex-row items-start justify-between gap-2">
        <AppText
          variant="bodyStrong"
          className="flex-1"
          numberOfLines={1}
          onPress={onOpen}
        >
          {booking.place?.name ?? t("place")}
        </AppText>
        <Badge tone={meta.tone} label={t(meta.label)} />
      </View>

      <View className="gap-0.5">
        <AppText variant="meta">
          {when.date} · {when.time}
        </AppText>
        {booking.place_service?.name ? (
          <AppText variant="caption">
            {t("service", { name: booking.place_service.name })}
          </AppText>
        ) : null}
        {booking.party_size ? (
          <AppText variant="caption">
            {t("partyOf", { party_size: booking.party_size })}
          </AppText>
        ) : null}
        {booking.note ? (
          <AppText variant="caption" numberOfLines={2}>
            “{booking.note}”
          </AppText>
        ) : null}
        {state === "lapsed" ? (
          <AppText variant="caption" tone="muted">
            {booking.place?.name ?? t("theOwner")}{" "}
            {t("didnTRespondBeforeThisDate")}
          </AppText>
        ) : null}
      </View>

      {canCancel ? (
        <Button
          title={cancel.isPending ? t("cancelling") : t("cancelBooking")}
          variant="outline"
          size="sm"
          disabled={cancel.isPending}
          onPress={() =>
            Alert.alert(t("cancelThisBooking"), t("theOwnerWillBeNotified"), [
              { text: t("keepIt"), style: "cancel" },
              {
                text: t("cancelBooking"),
                style: "destructive",
                onPress: () =>
                  cancel.mutate(
                    {
                      placeId: booking.place_id,
                      bookingId: booking.id,
                    },
                    {
                      onSettled: (res) => {
                        if (res && res.status === 200) {
                          toast.success(t("bookingCancelled"), {
                            description: t("theOwnerHasBeenNotified"),
                          });
                          return;
                        }
                        toast.error(
                          res?.message ?? t("weCouldnTCancelThisBooking"),
                          {
                            description: t("yourBookingIsUnchangedPleaseTry"),
                          },
                        );
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
  const t = useTranslations("places");

  const router = useRouter();
  const q = useMyBookings();

  const rows = q.data?.pages.flatMap((p) => p.rows) ?? [];
  const view = useQueryView(q, () => rows.length === 0);

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  const header = (
    <AppHeader variant="title" title={t("myBookings")} backFallback="/(app)" />
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
          message={t("couldnTLoadYourBookings")}
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
        refreshControl={<Refresher onRefresh={() => q.refetch()} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          view.kind === "empty" ? (
            <EmptyState
              icon="calendar-outline"
              title={t("noBookingsYet")}
              description={t("findAPlaceYouLikeAnd")}
              actionLabel={t("browsePlaces")}
              onAction={() => router.push("/(app)/places")}
            />
          ) : (
            <QueryUnavailable
              view={view}
              subject="your bookings"
              onRetry={() => q.refetch()}
            />
          )
        }
        ListFooterComponent={
          <ListFooter
            count={rows.length}
            isFetchingNextPage={q.isFetchingNextPage}
            hasNextPage={q.hasNextPage}
            isError={q.isFetchNextPageError}
            onRetry={() => q.fetchNextPage()}
          />
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
