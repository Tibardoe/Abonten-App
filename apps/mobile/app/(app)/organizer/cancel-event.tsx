import {
  useCancelEvent,
  useEventCancellationImpact,
} from "@/features/organizer/usePayouts";
import { AppText } from "@abonten/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <AppText className="text-sm text-muted-foreground">{label}</AppText>
      <AppText className="text-sm font-semibold text-foreground">
        {value}
      </AppText>
    </View>
  );
}

export default function CancelEventScreen() {
  const { eventId, title } = useLocalSearchParams<{
    eventId: string;
    title?: string;
  }>();
  const router = useRouter();
  const impact = useEventCancellationImpact(eventId ?? "");
  const cancel = useCancelEvent();
  const [confirmed, setConfirmed] = useState(false);

  const data =
    impact.data && impact.data.status === 200 ? impact.data.data : null;
  const impactError =
    impact.isError || (impact.data && impact.data.status !== 200);

  async function onCancel() {
    const res = await cancel.mutateAsync(eventId ?? "");
    if (res.status === 200) {
      Alert.alert("Event cancelled", res.message, [
        { text: "OK", onPress: () => router.back() },
      ]);
      return;
    }
    Alert.alert("Couldn't cancel", res.message ?? "Please try again.");
  }

  if (impact.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-10"
    >
      <AppText variant="sectionHeading">
        {title ?? "Cancel this event?"}
      </AppText>

      {impactError ? (
        <View className="gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <AppText className="text-sm text-destructive">
            {(impact.data &&
              impact.data.status !== 200 &&
              impact.data.message) ||
              "Couldn't load the cancellation details — how many tickets and buyers this affects. Cancelling is disabled until this loads."}
          </AppText>
          <Pressable
            onPress={() => impact.refetch()}
            accessibilityRole="button"
            className="self-start rounded-lg border border-border px-3 py-1.5 active:opacity-80"
          >
            <AppText variant="small" className="font-semibold text-foreground">
              {impact.isFetching ? "Retrying…" : "Retry"}
            </AppText>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3 rounded-xl border border-border bg-card p-4">
          <Row
            label="Paid tickets"
            value={String(data?.paidTicketCount ?? 0)}
          />
          <Row
            label="Free tickets"
            value={String(data?.freeTicketCount ?? 0)}
          />
          <Row label="Attendees" value={String(data?.attendeeCount ?? 0)} />
        </View>
      )}

      <View className="gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
        <AppText className="text-sm font-semibold text-destructive">
          This cannot be undone
        </AppText>
        <AppText variant="muted">
          Every ticket is cancelled, all paid buyers are refunded (the service
          fee is not returned), and every attendee is emailed. Create a new
          event if you need to reschedule.
        </AppText>
      </View>

      <Pressable
        onPress={() => setConfirmed((v) => !v)}
        className="flex-row items-center gap-3"
      >
        <View
          className={`h-5 w-5 items-center justify-center rounded border ${
            confirmed ? "border-destructive bg-destructive" : "border-border"
          }`}
        >
          {confirmed ? (
            <AppText className="text-[11px] font-bold text-white">✓</AppText>
          ) : null}
        </View>
        <AppText variant="small" className="flex-1">
          I understand this cancels the event and refunds all buyers.
        </AppText>
      </Pressable>

      <Pressable
        onPress={onCancel}
        disabled={!confirmed || cancel.isPending || !!impactError}
        className={`items-center rounded-xl px-4 py-3 ${
          !confirmed || cancel.isPending || impactError
            ? "bg-muted"
            : "bg-destructive active:opacity-90"
        }`}
      >
        {cancel.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <AppText
            className={`text-sm font-semibold ${
              !confirmed || impactError ? "text-muted-foreground" : "text-white"
            }`}
          >
            Cancel event
          </AppText>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        className="items-center rounded-xl border border-border px-4 py-3 active:opacity-90"
      >
        <AppText className="text-sm text-foreground">Keep event</AppText>
      </Pressable>
    </ScrollView>
  );
}
