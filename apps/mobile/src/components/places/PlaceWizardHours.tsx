import {
  DAY_LABELS,
  type PlaceWizard,
  TIME_RE,
} from "@/features/places/usePlaceWizard";
import { AppText, Input } from "@abonten/ui-native";
import { Pressable, View } from "react-native";

// Step 3 of the place wizard — the 7-day open/close editor. Mirrors the web
// PlaceCreateStepHours; times are plain "HH:MM" inputs validated against
// TIME_RE (the same shape create_place's NULLIF(...)::time cast expects).
export function PlaceWizardHours({ w }: { w: PlaceWizard }) {
  return (
    <View className="gap-3">
      <AppText variant="label">Opening hours</AppText>
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
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input
                  value={h.openTime ?? ""}
                  onChangeText={(v) => w.setHours(h.dayOfWeek, { openTime: v })}
                  placeholder="09:00"
                  keyboardType="numbers-and-punctuation"
                  invalid={!!h.openTime && !TIME_RE.test(h.openTime)}
                />
              </View>
              <View className="flex-1">
                <Input
                  value={h.closeTime ?? ""}
                  onChangeText={(v) =>
                    w.setHours(h.dayOfWeek, { closeTime: v })
                  }
                  placeholder="17:00"
                  keyboardType="numbers-and-punctuation"
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
