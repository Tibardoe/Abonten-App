import { useSession } from "@/auth/SessionProvider";
import { useFreeRsvp } from "@/features/checkout/useFreeRsvp";
import type { EventDetail } from "@/features/discovery/useEventDetail";
import { setPendingRedirect } from "@/lib/authRedirect";
import { useNowTick } from "@/lib/useNowTick";
import { resolveOccurrenceState } from "@abonten/core/eventPurchaseEligibility";
import { useToast } from "@abonten/ui-native";
import { usePathname, useRouter } from "expo-router";
import { useState } from "react";

// A free event's RSVP — the chosen date, the request, its outcome — owned by
// the event screen, so the date picker in the Tickets section and the
// sticky "Reserve spot" button at the foot of the page are the same action
// on the same state, not two copies that could disagree. Takes the event
// while it may still be loading, because the screen calls it before its
// loading/offline early returns (a hook can't sit after them).
export function useFreeRsvpFlow(event: EventDetail | undefined) {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useSession();
  const rsvp = useFreeRsvp(event?.id);

  const now = useNowTick();
  const occurrences = event?.event_occurrence ?? [];
  // Only a strictly-future occurrence can be RSVP'd (same rule the server
  // enforces); default to the earliest one.
  const occurrenceState = resolveOccurrenceState(
    event?.starts_at ?? null,
    event?.ends_at ?? null,
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
  // Only an RSVP made just now (not an existing ticket) offers alerts.
  const [justRsvped, setJustRsvped] = useState(false);

  async function submit() {
    if (!event || rsvp.isPending) return;
    if (!session) {
      if (pathname) setPendingRedirect(pathname);
      router.push("/(auth)/sign-in");
      return;
    }

    const res = await rsvp.mutateAsync({ eventId: event.id, occurrenceId });

    if (res.status === 200) {
      setDone(true);
      setJustRsvped(true);
      return;
    }
    if (res.status === 300) {
      setDone(true);
      toast.success("You're in", {
        description: "You already have a ticket for this event.",
      });
      return;
    }
    toast.error("Couldn't RSVP", {
      description: res.message ?? "Please try again in a moment.",
    });
  }

  return {
    now,
    occurrences,
    occurrenceId,
    pick: setPickedOccurrenceId,
    isOccurrenceSelectable,
    submit,
    pending: rsvp.isPending,
    done,
    justRsvped,
  };
}

export type FreeRsvpFlow = ReturnType<typeof useFreeRsvpFlow>;
