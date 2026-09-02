import { DateRangeField } from "@/components/explore/DateRangeField";
import type { EventWizard } from "@/features/events/useEventWizard";
import { TIME_RE, prettyDate } from "@/lib/datetime";
import { uuidv4 } from "@/lib/uuid";
import { AppText, Button, Field, Input } from "@abonten/ui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

// Step 3 of the event wizard — a single start/end range, or a list of
// specific dates (occurrences). Mirrors the web DateTimePicker's
// single/specific split. Dates come from the pure-JS DateRangeField; times
// are "HH:MM" text.
export function EventWizardSchedule({ w }: { w: EventWizard }) {
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState("18:00");
  const [draftEnd, setDraftEnd] = useState("22:00");

  function addOccurrence() {
    if (!draftDate || !TIME_RE.test(draftStart) || !TIME_RE.test(draftEnd)) {
      return;
    }
    w.setOccurrences((prev) => [
      ...prev,
      { id: uuidv4(), dateIso: draftDate, start: draftStart, end: draftEnd },
    ]);
    setDraftDate(null);
  }

  return (
    <View className="gap-4">
      <View className="flex-row gap-2">
        <ModeChip
          label="Single event"
          active={w.scheduleMode === "single"}
          onPress={() => w.setScheduleMode("single")}
        />
        <ModeChip
          label="Multiple dates"
          active={w.scheduleMode === "specific"}
          onPress={() => w.setScheduleMode("specific")}
        />
      </View>

      {w.scheduleMode === "single" ? (
        <View className="gap-3">
          <Field label="Dates" hint="Tap a start day, then an end day">
            <DateRangeField
              start={w.rangeStart}
              end={w.rangeEnd}
              onChange={w.setRange}
            />
          </Field>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label="Start time">
                <Input
                  value={w.rangeStartTime}
                  onChangeText={w.setRangeStartTime}
                  placeholder="18:00"
                  keyboardType="numbers-and-punctuation"
                  invalid={!TIME_RE.test(w.rangeStartTime)}
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label="End time">
                <Input
                  value={w.rangeEndTime}
                  onChangeText={w.setRangeEndTime}
                  placeholder="22:00"
                  keyboardType="numbers-and-punctuation"
                  invalid={!TIME_RE.test(w.rangeEndTime)}
                />
              </Field>
            </View>
          </View>
        </View>
      ) : (
        <View className="gap-3">
          {w.occurrences.map((o, i) => (
            <View
              key={o.id}
              className="flex-row items-center justify-between rounded-xl border border-border bg-card p-3"
            >
              <AppText className="text-[13px] text-foreground">
                {prettyDate(o.dateIso)} · {o.start}–{o.end}
              </AppText>
              <Pressable
                onPress={() =>
                  w.setOccurrences((prev) => prev.filter((_, idx) => idx !== i))
                }
              >
                <AppText className="text-[12px] text-destructive">
                  Remove
                </AppText>
              </Pressable>
            </View>
          ))}

          <View className="gap-3 rounded-xl border border-border border-dashed p-3">
            <AppText variant="label">Add a date</AppText>
            <DateRangeField
              start={draftDate}
              end={null}
              onChange={(r) => setDraftDate(r.start)}
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input
                  value={draftStart}
                  onChangeText={setDraftStart}
                  placeholder="18:00"
                  keyboardType="numbers-and-punctuation"
                  invalid={!TIME_RE.test(draftStart)}
                />
              </View>
              <View className="flex-1">
                <Input
                  value={draftEnd}
                  onChangeText={setDraftEnd}
                  placeholder="22:00"
                  keyboardType="numbers-and-punctuation"
                  invalid={!TIME_RE.test(draftEnd)}
                />
              </View>
            </View>
            <Button
              title="Add date"
              variant="outline"
              size="sm"
              disabled={
                !draftDate ||
                !TIME_RE.test(draftStart) ||
                !TIME_RE.test(draftEnd)
              }
              onPress={addOccurrence}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function ModeChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={
        active
          ? "rounded-full bg-primary px-4 py-1.5"
          : "rounded-full border border-border px-4 py-1.5"
      }
    >
      <AppText
        className={
          active
            ? "text-[12px] font-semibold text-primary-foreground"
            : "text-[12px] font-medium text-muted-foreground"
        }
      >
        {label}
      </AppText>
    </Pressable>
  );
}
