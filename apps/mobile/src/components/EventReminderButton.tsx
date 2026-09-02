import { REMINDER_OFFSETS } from "@/features/reminders/eventReminders";
import { useEventReminder } from "@/features/reminders/useEventReminder";
import { AppText, Button, Icon, Sheet } from "@abonten/ui-native";
import { useEffect, useState } from "react";
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
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<number[]>(offsets);

  useEffect(() => {
    if (open) setDraft(offsets);
  }, [open, offsets]);

  function toggle(minutes: number) {
    setDraft((d) =>
      d.includes(minutes) ? d.filter((m) => m !== minutes) : [...d, minutes],
    );
  }

  async function onSave() {
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
          <AppText className="text-[14px] font-semibold text-foreground">
            {active ? "Reminder on" : "Remind me"}
          </AppText>
          <AppText className="text-[12px] text-muted-foreground">
            {summary}
          </AppText>
        </View>
        <Icon name="chevron-forward" size={16} tone="muted" />
      </Pressable>

      <Sheet open={open} onClose={() => setOpen(false)} title="Remind me">
        <View className="gap-2">
          <AppText variant="muted">
            Pick when to be reminded. Reminders are scheduled on this device and
            still fire if the app is closed.
          </AppText>

          {REMINDER_OFFSETS.map((o) => {
            const checked = draft.includes(o.minutes);
            return (
              <Pressable
                key={o.minutes}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                onPress={() => toggle(o.minutes)}
                className="min-h-[48px] flex-row items-center gap-3 rounded-lg px-1 py-2 active:opacity-70"
              >
                <Icon
                  name={checked ? "checkbox" : "square-outline"}
                  size={22}
                  tone={checked ? "primary" : "muted"}
                />
                <AppText className="flex-1 text-[15px] text-foreground">
                  {o.label}
                </AppText>
              </Pressable>
            );
          })}

          <View className="mt-2 gap-2">
            <Button
              title="Save reminders"
              fullWidth
              loading={saving}
              onPress={onSave}
            />
            {active ? (
              <Button
                title="Turn off reminders"
                variant="outline"
                fullWidth
                onPress={onTurnOff}
              />
            ) : null}
          </View>
        </View>
      </Sheet>
    </>
  );
}
