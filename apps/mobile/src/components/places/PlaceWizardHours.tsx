import { TimeField } from "@/components/datetime/TimeField";
import {
  DAY_LABELS,
  type PlaceWizard,
  TIME_RE,
} from "@/features/places/usePlaceWizard";
import { AppText } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// Step 3 of the place wizard — the 7-day open/close editor. Mirrors the web
// PlaceCreateStepHours. Times use the wheel TimeField; the values still
// cross as "HH:MM" (the shape create_place's NULLIF(...)::time cast
// expects). "Copy to every day" fills the rest from the first open day.
export function PlaceWizardHours({ w }: { w: PlaceWizard }) {
  const firstOpen = w.openingHours.find((h) => !h.isClosed);

  function copyToAll() {
    if (!firstOpen) return;
    for (const h of w.openingHours) {
      w.setHours(h.dayOfWeek, {
        isClosed: false,
        openTime: firstOpen.openTime,
        closeTime: firstOpen.closeTime,
      });
    }
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <AppText variant="label">Opening hours</AppText>
        {firstOpen ? (
          <Pressable
            onPress={copyToAll}
            hitSlop={8}
            className="active:opacity-60"
          >
            <AppText className="text-[12px] font-semibold text-primary">
              Copy to every day
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {w.openingHours.map((h) => (
        <View
          key={h.dayOfWeek}
          className="gap-2 rounded-xl border border-border bg-card p-3"
        >
          <View className="flex-row items-center justify-between">
            <AppText className="text-[14px] font-semibold text-foreground">
              {DAY_LABELS[h.dayOfWeek]}
            </AppText>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: !h.isClosed }}
              onPress={() => w.setHours(h.dayOfWeek, { isClosed: !h.isClosed })}
              className={
                h.isClosed
                  ? "rounded-full border border-border px-3 py-1"
                  : "rounded-full bg-primary px-3 py-1"
              }
            >
              <AppText
                className={
                  h.isClosed
                    ? "text-[12px] font-medium text-muted-foreground"
                    : "text-[12px] font-semibold text-primary-foreground"
                }
              >
                {h.isClosed ? "Closed" : "Open"}
              </AppText>
            </Pressable>
          </View>
          {!h.isClosed ? (
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <TimeField
                  label={`${DAY_LABELS[h.dayOfWeek]} — opens`}
                  value={h.openTime ?? null}
                  onChange={(v) => w.setHours(h.dayOfWeek, { openTime: v })}
                  invalid={!!h.openTime && !TIME_RE.test(h.openTime)}
                />
              </View>
              <AppText className="text-[13px] text-muted-foreground">
                to
              </AppText>
              <View className="flex-1">
                <TimeField
                  label={`${DAY_LABELS[h.dayOfWeek]} — closes`}
                  value={h.closeTime ?? null}
                  onChange={(v) => w.setHours(h.dayOfWeek, { closeTime: v })}
                  invalid={!!h.closeTime && !TIME_RE.test(h.closeTime)}
                />
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
