import { safetyEventTiming } from "@abonten/core/safety/eventContext";
import type { Occurrence } from "@abonten/types/occurrenceType";
import { Button } from "@abonten/ui-native";
import { useTranslations } from "@abonten/ui-native/i18n";
import { useRouter } from "expo-router";
import { useSafetyProgram } from "./useSafety";

// On a ticket for an event that is on now, starts within half a day, or
// just ended (the way home): one tap to Safety, where this event is already
// chosen. Hidden while the programme is off for this person.

export function TicketSafetyButton({
  event,
}: {
  event: {
    id: string;
    starts_at: string | null;
    ends_at: string | null;
    occurrences?: Occurrence[] | null;
  };
}) {
  const t = useTranslations("safety");
  const router = useRouter();
  const { program } = useSafetyProgram();
  if (!program.enabled) return null;
  const timing = safetyEventTiming(
    {
      id: event.id,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      occurrences: event.occurrences ?? null,
    },
    Date.now(),
  );
  if (!timing) return null;
  return (
    <Button
      title={t("ticketSafety")}
      variant="outline"
      size="sm"
      leftIcon="shield-checkmark-outline"
      onPress={() => router.push("/(app)/safety")}
    />
  );
}
