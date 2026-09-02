import { AppText, Icon, Sheet } from "@abonten/ui-native";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  View,
} from "react-native";

// A polished, iPhone-alarm-style time picker: three snapping wheels
// (hour 1–12, minute 00–59, AM/PM) over a centred selection band, in a
// bottom sheet. Pure JS — no native module. Values cross the boundary as
// "HH:MM" 24-hour strings so the event/place wizards' existing state and
// serialisation are untouched; the wheel UI is 12-hour for familiarity.

const ITEM_H = 44;
const VISIBLE = 5; // odd, so one row sits dead-centre
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0..59
const PERIODS = ["AM", "PM"] as const;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parse(value: string | null): { h12: number; m: number; pm: boolean } {
  const match = value?.match(TIME_RE);
  const h24 = match ? Number(match[1]) : 18;
  const m = match ? Number(match[2]) : 0;
  const pm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { h12, m, pm };
}

function toHHMM(h12: number, m: number, pm: boolean): string {
  let h24 = h12 % 12;
  if (pm) h24 += 12;
  return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "6:05 PM" — the human label shown on the trigger and review screens. */
export function prettyTime(value: string | null): string {
  if (!value) return "Set time";
  const { h12, m, pm } = parse(value);
  return `${h12}:${String(m).padStart(2, "0")} ${pm ? "PM" : "AM"}`;
}

function Wheel<T>({
  data,
  index,
  onIndex,
  format,
  width,
}: {
  data: readonly T[];
  index: number;
  onIndex: (i: number) => void;
  format: (v: T) => string;
  width: number;
}) {
  const c = useThemeColors();
  const ref = useRef<ScrollView>(null);
  // Keep the wheel aligned when the value changes from outside a drag.
  useEffect(() => {
    ref.current?.scrollTo({ y: index * ITEM_H, animated: false });
  }, [index]);

  function settle(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const raw = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const next = Math.max(0, Math.min(data.length - 1, raw));
    if (next !== index) onIndex(next);
    ref.current?.scrollTo({ y: next * ITEM_H, animated: true });
  }

  return (
    <ScrollView
      ref={ref}
      style={{ width, height: VISIBLE * ITEM_H }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
      contentContainerStyle={{ paddingVertical: PAD }}
    >
      {data.map((v, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed positional wheel rows
          key={i}
          style={{ height: ITEM_H }}
          className="items-center justify-center"
        >
          <AppText
            style={{
              fontSize: 22,
              color: i === index ? c.foreground : c["muted-foreground"],
              fontWeight: i === index ? "700" : "400",
            }}
          >
            {format(v)}
          </AppText>
        </View>
      ))}
    </ScrollView>
  );
}

export function TimeField({
  value,
  onChange,
  label,
  invalid = false,
}: {
  value: string | null;
  onChange: (next: string) => void;
  label?: string;
  invalid?: boolean;
}) {
  const c = useThemeColors();
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => parse(value), [value]);
  const [hIdx, setHIdx] = useState(initial.h12 - 1);
  const [mIdx, setMIdx] = useState(initial.m);
  const [pIdx, setPIdx] = useState(initial.pm ? 1 : 0);

  function openSheet() {
    const p = parse(value);
    setHIdx(p.h12 - 1);
    setMIdx(p.m);
    setPIdx(p.pm ? 1 : 0);
    setOpen(true);
  }

  function confirm() {
    onChange(toHHMM(HOURS[hIdx], MINUTES[mIdx], pIdx === 1));
    setOpen(false);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          label ? `${label}: ${prettyTime(value)}` : undefined
        }
        onPress={openSheet}
        className={[
          "min-h-[48px] flex-row items-center justify-between rounded-xl border bg-background px-3.5 py-3 active:opacity-80",
          invalid ? "border-destructive" : "border-input",
        ].join(" ")}
      >
        <AppText
          className={
            value
              ? "text-[15px] text-foreground"
              : "text-[15px] text-muted-foreground"
          }
        >
          {prettyTime(value)}
        </AppText>
        <Icon name="time-outline" size={18} tone="muted" />
      </Pressable>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={label ?? "Pick a time"}
        footer={
          <Pressable
            accessibilityRole="button"
            onPress={confirm}
            className="min-h-[48px] items-center justify-center rounded-xl bg-primary active:opacity-90"
          >
            <AppText className="text-[15px] font-semibold text-primary-foreground">
              Done
            </AppText>
          </Pressable>
        }
      >
        <View className="items-center py-2">
          <View className="relative flex-row items-center">
            {/* centred selection band */}
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: PAD,
                height: ITEM_H,
                borderRadius: 12,
                backgroundColor: c.accent,
              }}
            />
            <Wheel
              data={HOURS}
              index={hIdx}
              onIndex={setHIdx}
              format={(v) => String(v)}
              width={64}
            />
            <AppText className="px-1 text-[22px] font-bold text-foreground">
              :
            </AppText>
            <Wheel
              data={MINUTES}
              index={mIdx}
              onIndex={setMIdx}
              format={(v) => String(v).padStart(2, "0")}
              width={64}
            />
            <Wheel
              data={PERIODS}
              index={pIdx}
              onIndex={setPIdx}
              format={(v) => v}
              width={64}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}
