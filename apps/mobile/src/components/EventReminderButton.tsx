import { ReminderOptionsSheet } from "@/components/reminders/ReminderOptionsSheet";
import { useEventReminder } from "@/features/reminders/useEventReminder";
import { AppText, Icon } from "@abonten/ui-native";
import { useState } from "react";
import { Alert, Linking, Pressable, View } from "react-native";

// "Remind me" control for the event detail screen. Opens a sheet to pick one
// or more lead times (10 min / 30 min / 1 h / 1 day before); each becomes a
// real OS-scheduled local notification that deep-links back to the event.
// Only rendered for events that are still upcoming.

export function EventReminderButton({
  eventId,
  eventTitle,
  startsAtIso,
  status,
}: {
  eventId: string;
  eventTitle: string;
  startsAtIso: string;
  status?: string | null;
}) {
  const { offsets, loading, saving, save } = useEventReminder(
    eventId,
    startsAtIso,
    status,
    eventTitle,
  );
  const [open, setOpen] = useState(false);

  async function onSave(draft: number[]) {
    const res = await save(draft, { eventTitle, startsAtIso });
    if (res.ok) {
      setOpen(false);
      return;
    }
    if (res.reason === "permission") {
      Alert.alert(
        "Notifications are off",
        "Turn on notifications for Abonten to get event reminders.",
        [
          { text: "Not now", style: "cancel" },
          { text: "Open settings", onPress: () => Linking.openSettings() },
        ],
      );
    }
  }

  async function onTurnOff() {
    await save([], { eventTitle, startsAtIso });
    setOpen(false);
  }

  const active = offsets.length > 0;
  const summary = active
    ? offsets.length === 1
      ? "1 reminder set"
      : `${offsets.length} reminders set`
    : "Get a reminder before it starts";

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={active ? "Edit event reminders" : "Set a reminder"}
        onPress={() => setOpen(true)}
        disabled={loading}
        className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4 active:opacity-80"
      >
        <Icon
          name={active ? "notifications" : "notifications-outline"}
          size={20}
          tone={active ? "primary" : "muted"}
        />
        <View className="flex-1">
          <AppText variant="bodyStrong">
            {active ? "Reminder on" : "Remind me"}
          </AppText>
          <AppText variant="meta">{summary}</AppText>
        </View>
        <Icon name="chevron-forward" size={16} tone="muted" />
      </Pressable>

      <ReminderOptionsSheet
        open={open}
        onClose={() => setOpen(false)}
        offsets={offsets}
        saving={saving}
        onSave={onSave}
        onTurnOff={onTurnOff}
      />
    </>
  );
}
