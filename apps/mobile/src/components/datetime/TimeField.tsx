import { isEnglishLike } from "@abonten/core/i18n/coreStrings";
import { AppText, Icon, Sheet } from "@abonten/ui-native";
import {
  getCurrentLocale,
  translatorFor,
  useLocale,
  useTranslations,
} from "@abonten/ui-native/i18n";
import { useThemeColors } from "@abonten/ui-native/theme";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  View,
} from "react-native";

// A polished, iPhone-alarm-style time picker: snapping wheels over a
// centred selection band, in a bottom sheet. Pure JS — no native module.
// The clock follows the app's language: 12-hour with AM/PM in English
// (hour 1–12, minute, AM/PM), 24-hour everywhere else (hour 00–23,
// minute), as people read times there. Values cross the boundary as
// "HH:MM" 24-hour strings either way, so the wizards' state and
// serialisation are untouched.

const ITEM_H = 44;
const VISIBLE = 5; // odd, so one row sits dead-centre
const PAD = ((VISIBLE - 1) / 2) * ITEM_H;

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i); // 0..23
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

/** Whether times read on a 12-hour clock in this language. */
function twelveHour(locale: string | null | undefined): boolean {
  return isEnglishLike(locale);
}

/**
 * "6:05 PM" in English, "18:05" elsewhere — the human label shown on the
 * trigger and review screens, in the app's language.
 */
export function prettyTime(
  value: string | null,
  locale: string | null = getCurrentLocale(),
): string {
  if (!value) return translatorFor("common")("setTime");
  const { h12, m, pm } = parse(value);
  if (!twelveHour(locale)) {
    const h24 = pm ? (h12 % 12) + 12 : h12 % 12;
    return `${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
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
  // The index this wheel last reported from its own scrolling, so the
  // "align to an external value" effect below can tell a programmatic
  // change (open the sheet on 6:05) from the echo of its own report.
  const reported = useRef(index);
  // A drag released with no fling never fires onMomentumScrollEnd; a drag
  // released WITH a fling fires it later. The settle timer covers the first
  // case and is cancelled by onMomentumScrollBegin for the second.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reported.current === index) return;
    reported.current = index;
    ref.current?.scrollTo({ y: index * ITEM_H, animated: false });
  }, [index]);

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  // Commit whichever row the wheel has come to rest on. Only ever called
  // once the scroll has genuinely stopped: settling from onScrollEndDrag
  // while a fling was still in flight used to call scrollTo mid-momentum,
  // and the two motions fought — the wheel shot off at full speed and could
  // not be caught until the sheet was reopened.
  function settle(offsetY: number) {
    const raw = Math.round(offsetY / ITEM_H);
    const next = Math.max(0, Math.min(data.length - 1, raw));
    if (next !== reported.current) {
      reported.current = next;
      onIndex(next);
    }
    if (Math.abs(offsetY - next * ITEM_H) > 0.5) {
      ref.current?.scrollTo({ y: next * ITEM_H, animated: true });
    }
  }

  return (
    <ScrollView
      ref={ref}
      style={{ width, height: VISIBLE * ITEM_H }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      snapToAlignment="start"
      decelerationRate="fast"
      bounces={false}
      overScrollMode="never"
      onMomentumScrollBegin={() => {
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }}
      onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(e) => {
        const y = e.nativeEvent.contentOffset.y;
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(() => {
          settleTimer.current = null;
          settle(y);
        }, 160);
      }}
      contentContainerStyle={{ paddingVertical: PAD }}
      contentOffset={{ x: 0, y: index * ITEM_H }}
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
  const t = useTranslations("common");
  const { locale } = useLocale();
  const twelve = twelveHour(locale);

  const c = useThemeColors();
  const [open, setOpen] = useState(false);
  const initial = useMemo(() => parse(value), [value]);
  const hourIndex = (p: { h12: number; pm: boolean }) =>
    twelve ? p.h12 - 1 : p.pm ? (p.h12 % 12) + 12 : p.h12 % 12;
  const [hIdx, setHIdx] = useState(hourIndex(initial));
  const [mIdx, setMIdx] = useState(initial.m);
  const [pIdx, setPIdx] = useState(initial.pm ? 1 : 0);

  function openSheet() {
    const p = parse(value);
    setHIdx(hourIndex(p));
    setMIdx(p.m);
    setPIdx(p.pm ? 1 : 0);
    setOpen(true);
  }

  function confirm() {
    onChange(
      twelve
        ? toHHMM(HOURS[hIdx], MINUTES[mIdx], pIdx === 1)
        : `${String(HOURS_24[hIdx]).padStart(2, "0")}:${String(
            MINUTES[mIdx],
          ).padStart(2, "0")}`,
    );
    setOpen(false);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          label ? `${label}: ${prettyTime(value, locale)}` : undefined
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
          {prettyTime(value, locale)}
        </AppText>
        <Icon name="time-outline" size={18} tone="muted" />
      </Pressable>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={label ?? t("pickATime")}
        footer={
          <Pressable
            accessibilityRole="button"
            onPress={confirm}
            className="min-h-[48px] items-center justify-center rounded-xl bg-primary active:opacity-90"
          >
            <AppText className="text-[15px] font-semibold text-primary-foreground">
              {t("done")}
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
              data={twelve ? HOURS : HOURS_24}
              index={hIdx}
              onIndex={setHIdx}
              format={(v) => (twelve ? String(v) : String(v).padStart(2, "0"))}
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
            {twelve ? (
              <Wheel
                data={PERIODS}
                index={pIdx}
                onIndex={setPIdx}
                format={(v) => v}
                width={64}
              />
            ) : null}
          </View>
        </View>
      </Sheet>
    </>
  );
}
