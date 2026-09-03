import { REMINDER_OFFSETS } from "@/features/reminders/eventReminders";
import { AppText, Button, Icon, Sheet } from "@abonten/ui-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

// The "pick lead times" sheet, shared by <EventReminderButton> (event detail)
// and the EventCard "…" menu. Presentational: the owner passes the current
// `offsets` + a `save`, so each screen keeps exactly one useEventReminder
// instance for the event.

export function ReminderOptionsSheet({
  open,
  onClose,
  offsets,
  saving,
  onSave,
  onTurnOff,
}: {
  open: boolean;
  onClose: () => void;
  offsets: number[];
  saving: boolean;
  onSave: (draft: number[]) => void;
  onTurnOff: () => void;
}) {
  const [draft, setDraft] = useState<number[]>(offsets);
  useEffect(() => {
    if (open) setDraft(offsets);
  }, [open, offsets]);

  function toggle(minutes: number) {
    setDraft((d) =>
      d.includes(minutes) ? d.filter((m) => m !== minutes) : [...d, minutes],
    );
  }

  const active = offsets.length > 0;

  return (
    <Sheet open={open} onClose={onClose} title="Remind me">
      <View className="gap-2">
        <AppText variant="muted">
          Pick when to be reminded. Notifications fire even if the app is
          closed, and your choice syncs to your other devices.
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
              <AppText variant="body" className="flex-1">
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
            disabled={saving}
            onPress={() => onSave(draft)}
          />
          {active ? (
            <Button
              title="Turn off reminders"
              variant="outline"
              fullWidth
              disabled={saving}
              onPress={onTurnOff}
            />
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}
