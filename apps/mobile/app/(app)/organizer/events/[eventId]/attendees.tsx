import { QueryUnavailable } from "@/components/app/QueryUnavailable";
import { TicketScannerSheet } from "@/components/organizer/TicketScannerSheet";
import {
  flattenAttendees,
  useAttendees,
  useCheckInTicket,
} from "@/features/organizer/useAttendees";
import { useQueryView } from "@/lib/useQueryView";
import type { AttendanceRow } from "@abonten/api-client";
import { AppText, Button, Refresher, useToast } from "@abonten/ui-native";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";

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
  const toast = useToast();
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
          if (res.status === 200) {
            toast.success(
              checkedIn
                ? `${attendee.user_info?.full_name ?? "Attendee"} checked in`
                : "Check-in undone",
            );
            return;
          }
          toast.error(res.message ?? "We couldn't check that ticket in.", {
            description: "The attendee list is unchanged. Try again.",
          });
        },
        onError: () => {
          toast.error("We couldn't reach the server.", {
            description: "Check your connection and try again.",
          });
        },
      },
    );
  };

  return (
    <View className="gap-2 rounded-xl border border-border bg-card p-4">
      <View className="flex-row items-center justify-between gap-2">
        <AppText className="flex-1 font-bold text-foreground" numberOfLines={1}>
          {name}
        </AppText>
        <View className="shrink-0 flex-row items-center gap-2">
          {attendee.ticket_type?.type ? (
            <AppText className="text-sm text-muted-foreground">
              {attendee.ticket_type.type}
            </AppText>
          ) : null}
          <View
            className={
              isCancelled
                ? "rounded-full bg-destructive/10 px-2 py-1"
                : "rounded-full bg-primary/10 px-2 py-1"
            }
          >
            <AppText
              className={
                isCancelled
                  ? "text-[13px] font-semibold text-destructive"
                  : "text-[13px] font-semibold text-primary"
              }
            >
              {isCancelled ? "Cancelled" : "Active"}
            </AppText>
          </View>
        </View>
      </View>

      {attendee.auth?.email ? (
        <AppText className="text-sm text-muted-foreground">
          {attendee.auth.email}
        </AppText>
      ) : null}
      {attendee.auth?.phone ? (
        <AppText className="text-sm text-muted-foreground">
          {attendee.auth.phone}
        </AppText>
      ) : null}

      {!isCancelled && attendee.ticket_id ? (
        <View className="pt-1">
          {isCheckedIn ? (
            <Pressable
              accessibilityRole="button"
              disabled={checkIn.isPending}
              onPress={() => toggle(false)}
              className="self-start active:opacity-70 disabled:opacity-50"
            >
              <AppText variant="small" tone="brand" className="font-semibold">
                ✓ Checked in — undo
              </AppText>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={checkIn.isPending}
              onPress={() => toggle(true)}
              className="self-start rounded-md bg-primary px-3 py-1.5 active:opacity-90 disabled:opacity-60"
            >
              <AppText className="text-[13px] font-semibold text-primary-foreground">
                {checkIn.isPending ? "Checking in…" : "Check in"}
              </AppText>
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
  // The server's own answer that this event is not this person's: shown
  // as such, never as a load failure.
  const forbidden = firstPage?.status === 403;
  // "No attendees yet" is only ever said for an answer the server gave;
  // loading, offline and failed are told apart.
  const view = useQueryView(q, () => rows.length === 0);
  const [scanOpen, setScanOpen] = useState(false);
  const canScan = view.kind === "content" || view.kind === "empty";

  const onEndReached = useCallback(() => {
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  }, [q]);

  return (
    <View className="flex-1 bg-background">
      <FlatList
        className="flex-1 bg-background"
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <AttendeeRow attendee={item} eventId={id} />}
        contentContainerClassName="gap-2 p-4 pb-16"
        ListHeaderComponent={
          <View className="mb-2 flex-row items-center justify-between gap-3">
            <AppText variant="screenTitle">Attendees</AppText>
            {canScan ? (
              <Button
                title="Scan tickets"
                size="sm"
                leftIcon="qr-code-outline"
                onPress={() => setScanOpen(true)}
              />
            ) : null}
          </View>
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={<Refresher onRefresh={() => q.refetch()} />}
        ListEmptyComponent={
          forbidden ? (
            <AppText className="mt-10 text-center text-sm text-muted-foreground">
              You're not authorized to view this event.
            </AppText>
          ) : view.kind === "empty" ? (
            <AppText className="mt-10 text-center text-sm text-muted-foreground">
              No attendees yet.
            </AppText>
          ) : (
            <QueryUnavailable
              view={view}
              subject="the attendee list"
              onRetry={() => q.refetch()}
              loading={<ActivityIndicator className="mt-10" />}
            />
          )
        }
        ListFooterComponent={
          q.isFetchingNextPage ? <ActivityIndicator className="my-4" /> : null
        }
      />

      <TicketScannerSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        eventId={id}
      />
    </View>
  );
}
