import { useSession } from "@/auth/SessionProvider";
import { useFreeRsvp } from "@/features/checkout/useFreeRsvp";
import type { EventDetail } from "@/features/discovery/useEventDetail";
import { setPendingRedirect } from "@/lib/authRedirect";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { Button } from "@abonten/ui-native";
import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

// Native echo of the web AttendingButton's RSVP path. One free ticket per
// event, quantity fixed at 1 server-side.
export function FreeRsvpCard({ event }: { event: EventDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const rsvp = useFreeRsvp(event.id);

  const occurrences = event.event_occurrence ?? [];
  const [occurrenceId, setOccurrenceId] = useState<string | null>(
    occurrences[0]?.id ?? null,
  );
  const [done, setDone] = useState(false);

  async function onRsvp() {
    if (!session) {
      if (pathname) setPendingRedirect(pathname);
      router.push("/(auth)/sign-in");
      return;
    }

    const res = await rsvp.mutateAsync({ eventId: event.id, occurrenceId });

    if (res.status === 200) {
      setDone(true);
      return;
    }
    if (res.status === 300) {
      setDone(true);
      Alert.alert("You're in", "You already have a ticket for this event.");
      return;
    }
    Alert.alert(
      "Couldn't RSVP",
      res.message ?? "Please try again in a moment.",
    );
  }

  if (done) {
    return (
      <View className="items-center gap-2 rounded-xl border border-border bg-card p-5">
        <Text className="text-base font-bold text-success">You're going</Text>
        <Pressable
          onPress={() => router.push("/(app)/tickets")}
          className="rounded-lg bg-primary px-4 py-2.5"
        >
          <Text className="text-sm font-semibold text-primary-foreground">
            View my ticket
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {occurrences.length > 1 ? (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-foreground">Date</Text>
          <View className="flex-row flex-wrap gap-2">
            {occurrences.map((o) => {
              const selected = o.id === occurrenceId;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => setOccurrenceId(o.id)}
                  className={`rounded-full border px-3 py-1.5 ${
                    selected
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      selected ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {formatDateWithSuffix(o.starts_at)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Text className="text-[11px] text-muted-foreground">
        This event is free — one ticket per person.
      </Text>

      <Button
        title={rsvp.isPending ? "Reserving…" : "RSVP — get free ticket"}
        loading={rsvp.isPending}
        onPress={onRsvp}
      />
    </View>
  );
}
