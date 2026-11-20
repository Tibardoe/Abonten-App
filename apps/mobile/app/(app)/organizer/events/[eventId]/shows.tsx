import { TimeField } from "@/components/datetime/TimeField";
import { DateRangeField } from "@/components/explore/DateRangeField";
import {
  useAddEventShows,
  useAddShowPass,
  useEventShows,
} from "@/features/events/useEventShows";
import { supabase } from "@/lib/supabase";
import { uuidv4 } from "@/lib/uuid";
import { formatMoney } from "@abonten/core/formatMoney";
import { formatDateTime } from "@abonten/core/i18n/format";
import {
  type ShowRunSlot,
  type Weekday,
  expandShowRun,
  showRunProblemMessage,
} from "@abonten/core/showRuns";
import { formatInTimeZone } from "@abonten/core/time/timeZone";
import {
  AppText,
  Button,
  Chip,
  Field,
  Icon,
  Input,
  KeyboardAwareScrollView,
  PressableScale,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useQuery } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Pressable, View } from "react-native";

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** "HH:MM" plus minutes, as a wall-clock "yyyy-mm-ddTHH:MM" (no zone). */
function addMinutesToWallClock(date: string, time: string, minutes: number) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + minutes * 60_000);
  return t.toISOString().slice(0, 16);
}

// Shows and copies (docs/architecture/show-runs.md): turn this listing into
// a run of shows — each its own listing with its own seats, door list and
// payout, listed once to buyers with a show picker — or make a separate
// copy with a new date. Mirrors the website's Manage › Details card.
export default function EventShowsScreen() {
  const t = useTranslations("events");
  const tc = useTranslations("core");
  const { locale } = useLocale();
  const toast = useToast();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = eventId ?? "";

  const { data: event } = useQuery({
    queryKey: ["mobile", "organizer", "event-basics", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event")
        .select(
          "id, timezone, starts_at, ends_at, series_id, currency, ticket_type(id, type, price, quantity, pass_shows)",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const shows = useEventShows(id, !!event?.series_id).data ?? [];
  const add = useAddEventShows(id);
  const addPass = useAddShowPass(id);
  const passes = (event?.ticket_type ?? []).filter((x) => x.pass_shows != null);
  const [passName, setPassName] = useState("");
  const [passShows, setPassShows] = useState("3");
  const [passPrice, setPassPrice] = useState("");
  const [passQuantity, setPassQuantity] = useState("");

  const zone = event?.timezone ?? "Africa/Accra";
  const defaultDuration =
    event?.starts_at && event?.ends_at
      ? Math.max(
          15,
          Math.round(
            (new Date(event.ends_at).getTime() -
              new Date(event.starts_at).getTime()) /
              60_000,
          ),
        )
      : 120;

  const [days, setDays] = useState<Weekday[]>([]);
  const [times, setTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState<string | null>(null);
  const [range, setRange] = useState<{
    start: string | null;
    end: string | null;
  }>({ start: null, end: null });
  const [duration, setDuration] = useState("");
  const [copyDay, setCopyDay] = useState<string | null>(null);
  const [copyTime, setCopyTime] = useState<string | null>(null);
  // One per submission: a retry after a lost answer makes nothing twice.
  const requestId = useRef(uuidv4());

  const minutes = Number(duration || defaultDuration);
  const slots: ShowRunSlot[] = useMemo(
    () => days.flatMap((weekday) => times.map((time) => ({ weekday, time }))),
    [days, times],
  );
  const preview = useMemo(
    () =>
      range.start && range.end
        ? expandShowRun(
            {
              fromDate: range.start,
              untilDate: range.end,
              slots,
              durationMinutes: minutes,
            },
            zone,
          )
        : null,
    [range, slots, minutes, zone],
  );

  // 15 November 2026 was a Sunday: day d of that week, in the reader's words.
  const weekdayName = (d: Weekday) =>
    formatInTimeZone(
      new Date(Date.UTC(2026, 10, 15 + d, 12)),
      "UTC",
      { weekday: "short" },
      locale,
    );

  async function addShows() {
    if (!preview?.ok || !range.start || !range.end) return;
    const res = await add.mutateAsync({
      rule: {
        fromDate: range.start,
        untilDate: range.end,
        slots,
        durationMinutes: minutes,
      },
      clientRequestId: requestId.current,
    });
    if (res.status === 200) {
      requestId.current = uuidv4();
      toast.success(res.message ?? t("addShows"));
      // The whole form starts again: dates left from the last run would
      // quietly apply to the next one.
      setDays([]);
      setTimes([]);
      setRange({ start: null, end: null });
      setDuration("");
    } else {
      toast.error(res.message ?? t("couldNotAddShows"));
    }
  }

  async function makeCopy() {
    if (!copyDay || !copyTime) return;
    const res = await add.mutateAsync({
      // Wall-clock times: the server reads them on the venue's clock.
      shows: [
        {
          startsAt: `${copyDay}T${copyTime}`,
          endsAt: addMinutesToWallClock(copyDay, copyTime, minutes),
        },
      ],
      separate: true,
      clientRequestId: requestId.current,
    });
    if (res.status === 200 && res.data.shows[0]) {
      requestId.current = uuidv4();
      toast.success(res.message ?? t("makeACopy"));
      router.replace(`/(app)/organizer/events/${res.data.shows[0].id}`);
    } else if (res.status !== 200) {
      toast.error(res.message ?? t("couldNotAddShows"));
    }
  }

  async function sellPass() {
    const res = await addPass.mutateAsync({
      name: passName.trim(),
      shows: Number(passShows),
      price: Number(passPrice),
      quantity: passQuantity.trim() ? Number(passQuantity) : null,
    });
    if (res.status === 200) {
      toast.success(res.message ?? t("sellPass"));
      setPassName("");
      setPassPrice("");
      setPassQuantity("");
    } else {
      toast.error(res.message ?? t("couldNotSellPass"));
    }
  }

  return (
    <KeyboardAwareScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 p-4 pb-16"
    >
      <Stack.Screen options={{ title: t("showsAndCopies") }} />
      <View className="gap-1">
        <AppText variant="screenTitle">{t("showsTitle")}</AppText>
        <AppText variant="meta">{t("showsIntro")}</AppText>
      </View>

      {shows.length > 0 ? (
        <View className="gap-2 rounded-xl border border-border bg-card p-3">
          {shows.map((show) => (
            <Pressable
              key={show.id}
              accessibilityRole="link"
              onPress={() =>
                show.id !== id &&
                router.push(`/(app)/organizer/events/${show.id}`)
              }
              className="flex-row items-center justify-between"
            >
              <AppText
                variant="small"
                className={show.id === id ? "font-semibold" : "text-primary"}
              >
                {formatInTimeZone(
                  show.starts_at,
                  show.timezone,
                  {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  },
                  locale,
                )}
              </AppText>
              <AppText variant="caption" tone="muted">
                {show.status === "canceled"
                  ? t("showCancelled")
                  : show.sold_out
                    ? t("showSoldOut")
                    : show.seats_left != null
                      ? t("showSeatsLeft", { count: show.seats_left })
                      : t("showOnSale")}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View className="gap-3">
        <AppText variant="small" className="font-semibold">
          {t("repeatOn")}
        </AppText>
        <View className="flex-row flex-wrap gap-2">
          {WEEKDAYS.map((d) => (
            <Chip
              key={d}
              label={weekdayName(d)}
              selected={days.includes(d)}
              onPress={() =>
                setDays((prev) =>
                  prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
                )
              }
            />
          ))}
        </View>

        <View className="flex-row items-end gap-2">
          <View className="flex-1">
            <TimeField
              label={t("showTimes")}
              value={newTime}
              onChange={setNewTime}
            />
          </View>
          <Button
            title={t("addTime")}
            variant="outline"
            size="sm"
            disabled={!newTime || times.includes(newTime)}
            onPress={() => {
              if (!newTime) return;
              setTimes((prev) => [...prev, newTime].sort());
              setNewTime(null);
            }}
          />
        </View>
        {times.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {times.map((time) => (
              <PressableScale
                key={time}
                accessibilityRole="button"
                accessibilityLabel={t("removeTime", {
                  time: clockTime(time, locale),
                })}
                onPress={() =>
                  setTimes((prev) => prev.filter((x) => x !== time))
                }
                haptic
                className="min-h-[44px] flex-row items-center gap-1.5 rounded-full bg-primary px-3.5"
              >
                <AppText className="text-[13px] font-semibold text-primary-foreground">
                  {clockTime(time, locale)}
                </AppText>
                <Icon name="close" size={14} tone="inverse" />
              </PressableScale>
            ))}
          </View>
        ) : null}

        <Field label={`${t("runFrom")} – ${t("runUntil")}`}>
          <DateRangeField
            start={range.start}
            end={range.end}
            onChange={setRange}
          />
        </Field>

        <Field label={t("showLengthMinutes")}>
          <Input
            value={duration}
            onChangeText={setDuration}
            keyboardType="number-pad"
            placeholder={String(defaultDuration)}
          />
        </Field>

        {preview && !preview.ok && slots.length > 0 ? (
          <AppText variant="small" tone="error">
            {showRunProblemMessage(tc, preview.problem)}
          </AppText>
        ) : null}

        <Button
          title={
            preview?.ok
              ? t("addShowsCount", { count: preview.shows.length })
              : t("addShows")
          }
          fullWidth
          loading={add.isPending}
          disabled={add.isPending || !preview?.ok}
          onPress={addShows}
        />
      </View>

      <View className="gap-3 border-t border-border pt-5">
        <AppText variant="small" className="font-semibold">
          {t("makeACopy")}
        </AppText>
        <AppText variant="meta">{t("makeACopyHint")}</AppText>
        <DateRangeField
          mode="single"
          start={copyDay}
          end={null}
          onChange={(next) => setCopyDay(next.start)}
        />
        <TimeField
          label={t("copyTime")}
          value={copyTime}
          onChange={setCopyTime}
        />
        <Button
          title={t("makeACopy")}
          variant="outline"
          fullWidth
          loading={add.isPending}
          disabled={add.isPending || !copyDay || !copyTime}
          onPress={makeCopy}
        />
      </View>

      {event?.series_id ? (
        <View className="gap-3 border-t border-border pt-5">
          <AppText variant="small" className="font-semibold">
            {t("passesTitle")}
          </AppText>
          <AppText variant="meta">{t("passesIntro")}</AppText>
          {passes.map((p) => (
            <View key={p.id} className="flex-row justify-between gap-2">
              <AppText variant="small" className="font-medium">
                {p.type}
              </AppText>
              <AppText variant="caption" tone="muted">
                {t("passSummary", {
                  shows: p.pass_shows ?? 0,
                  price: formatMoney(event.currency, p.price, { locale }),
                  limited: p.quantity == null ? "no" : "yes",
                  left: p.quantity ?? 0,
                })}
              </AppText>
            </View>
          ))}
          <Field label={t("passName")}>
            <Input
              value={passName}
              onChangeText={setPassName}
              maxLength={60}
              placeholder={t("passNamePlaceholder")}
            />
          </Field>
          <Field label={t("passShows")}>
            <Input
              value={passShows}
              onChangeText={setPassShows}
              keyboardType="number-pad"
            />
          </Field>
          <Field
            label={
              event.currency
                ? t("passPriceIn", { currency: event.currency })
                : t("passPrice")
            }
          >
            <Input
              value={passPrice}
              onChangeText={setPassPrice}
              keyboardType="decimal-pad"
            />
          </Field>
          <Field label={t("passesPerShow")}>
            <Input
              value={passQuantity}
              onChangeText={setPassQuantity}
              keyboardType="number-pad"
              placeholder={t("noLimit")}
            />
          </Field>
          <AppText variant="caption" tone="muted">
            {t("passesHowItWorks")}
          </AppText>
          <Button
            title={t("sellPass")}
            fullWidth
            loading={addPass.isPending}
            disabled={
              addPass.isPending ||
              !passName.trim() ||
              Number(passShows) < 2 ||
              !(Number(passPrice) > 0)
            }
            onPress={sellPass}
          />
        </View>
      ) : null}
    </KeyboardAwareScrollView>
  );
}

/** A show time ("18:30") on the app's clock style ("6:30 PM" in English). */
function clockTime(time: string, locale: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return formatDateTime(Date.UTC(2000, 0, 1, hours, minutes), locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
