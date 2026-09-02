import { AppText, Icon } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

// Pure-JS month calendar with range selection — the native stand-in for the
// web DateRangePickerSheet (react-day-picker). No dependency: a 7-column
// grid the user taps twice (start, then end). Values are ISO date strings
// (yyyy-mm-dd), the shape get_filtered_events' p_start_date / p_end_date
// expect.

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function startOfDay(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function DateRangeField({
  start,
  end,
  onChange,
  mode = "range",
}: {
  start: string | null;
  end: string | null;
  onChange: (next: { start: string | null; end: string | null }) => void;
  /** "single" picks exactly one day (end stays null); "range" is start→end. */
  mode?: "single" | "range";
}) {
  const c = useThemeColors();
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const [view, setView] = useState(() => new Date(today));

  const cells = useMemo(() => {
    const year = view.getFullYear();
    const month = view.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(year, month, d));
    return out;
  }, [view]);

  function pick(d: Date) {
    const s = iso(d);
    // Single-day mode: every tap just sets the one date.
    if (mode === "single") {
      onChange({ start: s, end: null });
      return;
    }
    // No range yet, or a full range already set -> start a new range.
    if (!start || (start && end)) {
      onChange({ start: s, end: null });
      return;
    }
    // Second tap: order the two ends.
    if (startOfDay(s) < startOfDay(start)) {
      onChange({ start: s, end: start });
    } else {
      onChange({ start, end: s });
    }
  }

  const startMs = start ? startOfDay(start) : null;
  const endMs = end ? startOfDay(end) : null;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityLabel="Previous month"
          hitSlop={8}
          onPress={() =>
            setView((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))
          }
        >
          <Icon name="chevron-back" size={18} tone="foreground" />
        </Pressable>
        <AppText variant="bodyStrong">
          {MONTHS[view.getMonth()]} {view.getFullYear()}
        </AppText>
        <Pressable
          accessibilityLabel="Next month"
          hitSlop={8}
          onPress={() =>
            setView((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))
          }
        >
          <Icon name="chevron-forward" size={18} tone="foreground" />
        </Pressable>
      </View>

      <View className="flex-row">
        {WEEKDAYS.map((w, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed weekday header
            key={`${w}-${i}`}
            className="flex-1 items-center py-1"
          >
            <AppText variant="caption">{w}</AppText>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {cells.map((d, i) => {
          if (!d) {
            return (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length calendar padding
                key={`pad-${i}`}
                style={{ width: `${100 / 7}%` }}
                className="h-9"
              />
            );
          }
          const ms = d.getTime();
          const isStart = startMs != null && ms === startMs;
          const isEnd = endMs != null && ms === endMs;
          const inRange =
            startMs != null && endMs != null && ms > startMs && ms < endMs;
          const isPast = ms < today.getTime();
          const selected = isStart || isEnd;

          return (
            <Pressable
              key={iso(d)}
              disabled={isPast}
              onPress={() => pick(d)}
              style={{ width: `${100 / 7}%` }}
              className="h-9 items-center justify-center"
            >
              <View
                className="h-8 w-8 items-center justify-center rounded-full"
                style={{
                  backgroundColor: selected
                    ? c.primary
                    : inRange
                      ? c.muted
                      : "transparent",
                }}
              >
                <AppText
                  className="text-[13px]"
                  style={{
                    color: selected
                      ? c["primary-foreground"]
                      : isPast
                        ? c["muted-foreground"]
                        : c.foreground,
                    opacity: isPast ? 0.4 : 1,
                  }}
                >
                  {d.getDate()}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      {(start || end) && (
        <Pressable
          onPress={() => onChange({ start: null, end: null })}
          className="self-start pt-1"
        >
          <AppText variant="small" tone="brand" className="font-medium">
            Clear dates
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
