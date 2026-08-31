import {
  useCancelEvent,
  useEventCancellationImpact,
} from "@/features/organizer/usePayouts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="text-sm font-semibold text-foreground">{value}</Text>
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
      <Text className="text-lg font-bold text-foreground">
        {title ?? "Cancel this event?"}
      </Text>

      {impactError ? (
        <Text className="text-sm text-destructive">
          {(impact.data && impact.data.status !== 200 && impact.data.message) ||
            "Couldn't load the cancellation details."}
        </Text>
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
        <Text className="text-sm font-semibold text-destructive">
          This cannot be undone
        </Text>
        <Text className="text-xs text-muted-foreground">
          Every ticket is cancelled, all paid buyers are refunded (the service
          fee is not returned), and every attendee is emailed. Create a new
          event if you need to reschedule.
        </Text>
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
            <Text className="text-[11px] font-bold text-white">✓</Text>
          ) : null}
        </View>
        <Text className="flex-1 text-xs text-foreground">
          I understand this cancels the event and refunds all buyers.
        </Text>
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
          <Text
            className={`text-sm font-semibold ${
              !confirmed || impactError ? "text-muted-foreground" : "text-white"
            }`}
          >
            Cancel event
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => router.back()}
        className="items-center rounded-xl border border-border px-4 py-3 active:opacity-90"
      >
        <Text className="text-sm text-foreground">Keep event</Text>
      </Pressable>
    </ScrollView>
  );
}
