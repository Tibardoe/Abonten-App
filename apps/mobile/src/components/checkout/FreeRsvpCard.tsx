import { useSession } from "@/auth/SessionProvider";
import { useFreeRsvp } from "@/features/checkout/useFreeRsvp";
import type { EventDetail } from "@/features/discovery/useEventDetail";
import { setPendingRedirect } from "@/lib/authRedirect";
import { useNowTick } from "@/lib/useNowTick";
import { formatDateWithSuffix } from "@abonten/core/dateFormatter";
import { resolveOccurrenceState } from "@abonten/core/eventPurchaseEligibility";
import { AppText, Button } from "@abonten/ui-native";
import { usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";

// Native echo of the web AttendingButton's RSVP path. One free ticket per
// event, quantity fixed at 1 server-side.
export function FreeRsvpCard({ event }: { event: EventDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const rsvp = useFreeRsvp(event.id);

  const now = useNowTick();
  const occurrences = event.event_occurrence ?? [];
  // Only a strictly-future occurrence can be RSVP'd (same rule the server
  // enforces); default to the earliest one.
  const occurrenceState = resolveOccurrenceState(
    event.starts_at,
    event.ends_at,
    occurrences,
    now,
  );
  const [pickedOccurrenceId, setPickedOccurrenceId] = useState<string | null>(
    null,
  );
  const isOccurrenceSelectable = (o: { starts_at: string | Date }) =>
    new Date(o.starts_at).getTime() > now;
  const occurrenceId =
    pickedOccurrenceId &&
    occurrences.some(
      (o) => o.id === pickedOccurrenceId && isOccurrenceSelectable(o),
    )
      ? pickedOccurrenceId
      : (occurrenceState.nextPurchasable?.id ?? null);
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
        <AppText className="text-base font-bold text-success">
          You're going
        </AppText>
        <Pressable
          onPress={() => router.push("/(app)/tickets")}
          className="rounded-lg bg-primary px-4 py-2.5"
        >
          <AppText className="text-sm font-semibold text-primary-foreground">
            View my ticket
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-3">
      {occurrences.length > 1 ? (
        <View className="gap-2">
          <AppText className="text-sm font-semibold text-foreground">
            Date
          </AppText>
          <View className="flex-row flex-wrap gap-2">
            {occurrences.map((o) => {
              const selectable = isOccurrenceSelectable(o);
              const selected = selectable && o.id === occurrenceId;
              const inProgress =
                !selectable && new Date(o.ends_at).getTime() > now;
              return (
                <Pressable
                  key={o.id}
                  disabled={!selectable}
                  onPress={() => setPickedOccurrenceId(o.id)}
                  className={`rounded-full border px-3 py-1.5 ${
                    selected
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                  } ${selectable ? "" : "opacity-40"}`}
                >
                  <AppText
                    className={`text-[13px] ${
                      selected ? "text-primary-foreground" : "text-foreground"
                    }`}
                  >
                    {formatDateWithSuffix(o.starts_at)}
                    {selectable
                      ? ""
                      : inProgress
                        ? " · in progress"
                        : " · past"}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <AppText variant="caption">
        This event is free — one ticket per person.
      </AppText>

      <Button
        title={rsvp.isPending ? "Reserving…" : "RSVP — get free ticket"}
        loading={rsvp.isPending}
        onPress={onRsvp}
      />
    </View>
  );
}
