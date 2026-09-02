import { TimeField } from "@/components/datetime/TimeField";
import { DateRangeField } from "@/components/explore/DateRangeField";
import type { EventWizard } from "@/features/events/useEventWizard";
import { TIME_RE, prettyDate } from "@/lib/datetime";
import { uuidv4 } from "@/lib/uuid";
import { AppText, Button, Field, SegmentedTabs } from "@abonten/ui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

// Step 3 of the event wizard. First choice: one continuous event (a single
// day, or an explicit start-day → end-day span) vs a list of specific
// dates. Mirrors the web DateTimePicker's single/specific split, but the
// single-day case no longer forces a range. Dates come from the pure-JS
// calendar; times use the wheel TimeField and cross as "HH:MM".
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
    <View className="gap-5">
      <View className="flex-row gap-2">
        <ModeChip
          label="One event"
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
        <View className="gap-4">
          <SegmentedTabs
            options={[
              { key: "single", label: "Single date" },
              { key: "range", label: "Date range" },
            ]}
            value={w.dateMode}
            onChange={w.setDateMode}
          />

          {w.dateMode === "single" ? (
            <Field label="Event date" hint="Tap the day your event happens">
              <DateRangeField
                mode="single"
                start={w.rangeStart}
                end={null}
                onChange={(r) => w.setRange({ start: r.start, end: null })}
              />
            </Field>
          ) : (
            <Field
              label="Start & end date"
              hint="Tap the first day, then the last day"
            >
              <DateRangeField
                start={w.rangeStart}
                end={w.rangeEnd}
                onChange={w.setRange}
              />
            </Field>
          )}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label={w.dateMode === "single" ? "Start time" : "Starts"}>
                <TimeField
                  label="Start time"
                  value={w.rangeStartTime}
                  onChange={w.setRangeStartTime}
                  invalid={!TIME_RE.test(w.rangeStartTime)}
                />
              </Field>
            </View>
            <View className="flex-1">
              <Field label={w.dateMode === "single" ? "End time" : "Ends"}>
                <TimeField
                  label="End time"
                  value={w.rangeEndTime}
                  onChange={w.setRangeEndTime}
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
              <AppText variant="small">
                {prettyDate(o.dateIso)} · {o.start}–{o.end}
              </AppText>
              <Pressable
                onPress={() =>
                  w.setOccurrences((prev) => prev.filter((_, idx) => idx !== i))
                }
              >
                <AppText variant="small" tone="error">
                  Remove
                </AppText>
              </Pressable>
            </View>
          ))}

          <View className="gap-3 rounded-xl border border-dashed border-border p-3">
            <AppText variant="label">Add a date</AppText>
            <DateRangeField
              mode="single"
              start={draftDate}
              end={null}
              onChange={(r) => setDraftDate(r.start)}
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TimeField
                  label="Start time"
                  value={draftStart}
                  onChange={setDraftStart}
                  invalid={!TIME_RE.test(draftStart)}
                />
              </View>
              <View className="flex-1">
                <TimeField
                  label="End time"
                  value={draftEnd}
                  onChange={setDraftEnd}
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
          ? "rounded-full bg-primary px-4 py-2"
          : "rounded-full border border-border px-4 py-2"
      }
    >
      <AppText
        className={
          active
            ? "text-[13px] font-semibold text-primary-foreground"
            : "text-[13px] font-medium text-muted-foreground"
        }
      >
        {label}
      </AppText>
    </Pressable>
  );
}
