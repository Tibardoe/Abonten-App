import { TimeField } from "@/components/datetime/TimeField";
import { DateRangeField } from "@/components/explore/DateRangeField";
import {
  type PickedVenue,
  VenuePickerField,
} from "@/features/events/VenuePickerField";
import { api } from "@/lib/api";
import {
  MAX_RESCHEDULE_MESSAGE,
  rescheduleMessageProblem,
  rescheduleProblem,
  rescheduleRefundUntil,
} from "@abonten/core/eventReschedule";
import {
  formatInTimeZone,
  parseEventTimestamp,
} from "@abonten/core/time/timeZone";
import {
  AppText,
  Button,
  Chip,
  Field,
  Input,
  KeyboardAwareScrollView,
  useToast,
} from "@abonten/ui-native";
import { useLocale, useTranslations } from "@abonten/ui-native/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";

const WHEN: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
};

type Mode = "date" | "venue" | "postpone";

/** "yyyy-mm-dd" + "HH:MM" as a wall clock, a day later when `nextDay`. */
function wallClock(date: string, time: string, nextDay = false): string {
  if (!nextDay) return `${date}T${time}`;
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.toISOString().slice(0, 10)}T${time}`;
}

// Move an event that people already hold tickets for
// (docs/architecture/event-reschedule.md): a new date, a new venue or both;
// one date of an event with several dates; or postponed with no new date
// yet. Everyone holding a ticket is told (notice, push, email) and may keep
// it or give it back for the ticket price and the service fee until the
// window closes (while postponed: until the new date). Mirrors the
// website's Manage › Details card; GET/POST
// /api/mobile/organizer/events/:id/reschedule.
export default function RescheduleEventScreen() {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  const { locale } = useLocale();
  const toast = useToast();
  const qc = useQueryClient();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const id = eventId ?? "";
  const key = ["mobile", "organizer", "reschedule-setup", id];

  const setupQuery = useQuery({
    queryKey: key,
    enabled: !!id,
    queryFn: async () => {
      const res = await api.organizer.rescheduleSetup(id);
      if (res.status !== 200) throw new Error(res.message);
      return res.data;
    },
  });
  const setup = setupQuery.data;

  const [mode, setMode] = useState<Mode>("date");
  const [occurrenceId, setOccurrenceId] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [venueToo, setVenueToo] = useState(false);
  const [picked, setPicked] = useState<PickedVenue>(null);
  const [message, setMessage] = useState("");

  const withVenue = mode === "venue" || (mode === "date" && venueToo);
  const chosenDate =
    setup && setup.dates.length > 0
      ? (setup.dates.find((d) => d.id === occurrenceId) ?? null)
      : null;

  const move = useMutation({
    mutationFn: () =>
      api.organizer.rescheduleEvent(id, {
        message,
        ...(mode === "postpone"
          ? { postpone: true }
          : {
              occurrenceId: chosenDate?.id ?? null,
              // Wall-clock times: the server reads them on the venue's clock.
              startsAt:
                mode === "date" && day && startTime
                  ? wallClock(day, startTime)
                  : null,
              endsAt:
                mode === "date" && day && startTime && endTime
                  ? wallClock(day, endTime, endTime <= startTime)
                  : null,
              venue: withVenue ? (picked?.venue ?? null) : null,
            }),
      }),
    onSuccess: (res) => {
      if (res.status === 200) {
        toast.success(res.message);
        qc.invalidateQueries({ queryKey: key });
        qc.invalidateQueries({ queryKey: ["mobile", "organizer"] });
        router.back();
      } else {
        toast.error(res.message ?? t("couldNotMoveEvent"));
      }
    },
    onError: () => toast.error(t("couldNotMoveEvent")),
  });

  if (!setup) {
    return (
      <>
        <Stack.Screen options={{ title: t("rescheduleTitle") }} />
        {setupQuery.isError ? (
          <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
            <AppText variant="meta" className="text-center">
              {t("rescheduleCouldNotLoad")}
            </AppText>
            <Button
              title={tc("retry")}
              variant="outline"
              onPress={() => setupQuery.refetch()}
            />
          </View>
        ) : null}
      </>
    );
  }

  const zone = setup.timezone;
  const when = (iso: string | Date) =>
    formatInTimeZone(iso, zone, WHEN, locale);
  const severalDates = setup.dates.length > 0;
  const postponed = !!setup.postponedAt;
  const startsAt =
    mode === "date" && day && startTime
      ? parseEventTimestamp(wallClock(day, startTime), zone)
      : null;
  const endsAt =
    mode === "date" && day && startTime && endTime
      ? parseEventTimestamp(wallClock(day, endTime, endTime <= startTime), zone)
      : null;
  const problem =
    mode === "postpone"
      ? rescheduleMessageProblem(message)
      : mode === "venue"
        ? picked
          ? rescheduleMessageProblem(message)
          : "venue"
        : severalDates && !chosenDate
          ? "date"
          : withVenue && !picked
            ? "venue"
            : rescheduleProblem({
                startsAt,
                endsAt,
                message,
                currentStartsAt: chosenDate
                  ? new Date(chosenDate.startsAt)
                  : setup.startsAt
                    ? new Date(setup.startsAt)
                    : null,
                currentEndsAt: chosenDate
                  ? new Date(chosenDate.endsAt)
                  : setup.endsAt
                    ? new Date(setup.endsAt)
                    : null,
                moves: chosenDate ? chosenDate.moves : setup.moves,
                sameDateAllowed: withVenue || postponed,
              });
  const refundStart =
    mode === "date"
      ? startsAt
      : mode === "venue"
        ? setup.startsAt
          ? new Date(setup.startsAt)
          : setup.dates[0]
            ? new Date(setup.dates[0].startsAt)
            : null
        : null;
  const refundUntil = refundStart ? rescheduleRefundUntil(refundStart) : null;

  const blockedText =
    setup.blocked === "not_published"
      ? t("rescheduleBlockedNotPublished")
      : setup.blocked === "started"
        ? t("rescheduleBlockedStarted")
        : setup.blocked === "too_many"
          ? t("rescheduleBlockedTooMany")
          : null;

  const modes: Mode[] = postponed
    ? ["date"]
    : [
        "date",
        ...(setup.seated ? [] : (["venue"] as Mode[])),
        ...(setup.canPostpone ? (["postpone"] as Mode[]) : []),
      ];
  const modeLabel = (m: Mode) =>
    m === "postpone"
      ? t("rescheduleModePostpone")
      : m === "venue"
        ? t("rescheduleModeVenue")
        : severalDates
          ? t("rescheduleModeOneDate")
          : t("rescheduleNewDate");
  const submitLabel =
    mode === "postpone"
      ? t("reschedulePostponeSubmit")
      : postponed
        ? t("rescheduleSetDateSubmit")
        : chosenDate
          ? t("rescheduleSubmitDate")
          : t("rescheduleSubmit");

  function confirmMove() {
    if (problem || !setup) return;
    const title = setup.title;
    if (mode === "postpone") {
      Alert.alert(
        t("reschedulePostponeConfirmTitle", { title }),
        t("reschedulePostponeConfirmBody", { count: setup.holders }),
        [
          { text: tc("cancel"), style: "cancel" },
          {
            text: t("reschedulePostponeSubmit"),
            onPress: () => move.mutate(),
          },
        ],
      );
      return;
    }
    Alert.alert(
      mode === "venue"
        ? t("rescheduleConfirmVenueTitle", {
            title,
            venue: picked?.label ?? "",
          })
        : chosenDate
          ? t("rescheduleConfirmDateTitle", {
              title,
              when: startsAt ? when(startsAt) : "",
            })
          : t("rescheduleConfirmTitle", {
              title,
              when: startsAt ? when(startsAt) : "",
            }),
      t("rescheduleConfirmBody", {
        count: setup.holders,
        refundUntil: refundUntil ? when(refundUntil) : "",
      }),
      [
        { text: tc("cancel"), style: "cancel" },
        { text: t("rescheduleSubmit"), onPress: () => move.mutate() },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t("rescheduleTitle") }} />
      <KeyboardAwareScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 p-4 pb-12"
      >
        <AppText variant="meta">{t("rescheduleIntro")}</AppText>
        {postponed && setup.postponedAt ? (
          <View className="rounded-xl bg-muted p-3">
            <AppText variant="small">
              {t("reschedulePostponedNow", { when: when(setup.postponedAt) })}
            </AppText>
          </View>
        ) : null}
        {blockedText ? (
          <AppText variant="small">{blockedText}</AppText>
        ) : (
          <>
            {modes.length > 1 ? (
              <View className="flex-row flex-wrap gap-2">
                {modes.map((m) => (
                  <Chip
                    key={m}
                    label={modeLabel(m)}
                    selected={mode === m}
                    onPress={() => setMode(m)}
                  />
                ))}
              </View>
            ) : null}
            {setup.seated && !postponed ? (
              <AppText variant="caption" tone="muted">
                {t("rescheduleSeatedNoVenue")}
              </AppText>
            ) : null}

            {mode === "date" ? (
              <>
                {severalDates ? (
                  <Field label={t("rescheduleWhichDate")}>
                    <View className="flex-row flex-wrap gap-2">
                      {setup.dates.map((d) => (
                        <Chip
                          key={d.id}
                          label={
                            d.moves >= setup.maxMoves
                              ? t("rescheduleDateMovedTwice", {
                                  when: when(d.startsAt),
                                })
                              : when(d.startsAt)
                          }
                          selected={occurrenceId === d.id}
                          // A date moved twice can't move again.
                          onPress={() =>
                            d.moves < setup.maxMoves && setOccurrenceId(d.id)
                          }
                        />
                      ))}
                    </View>
                  </Field>
                ) : setup.startsAt && !postponed ? (
                  <AppText variant="small">
                    {t("rescheduleCurrent", { when: when(setup.startsAt) })}
                  </AppText>
                ) : null}
                <Field label={t("rescheduleNewDate")}>
                  <DateRangeField
                    mode="single"
                    start={day}
                    end={null}
                    onChange={(next) => setDay(next.start)}
                  />
                </Field>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    {/* The field shows only the time: its name sits above it. */}
                    <Field label={t("rescheduleStartTime")}>
                      <TimeField
                        label={t("rescheduleStartTime")}
                        value={startTime}
                        onChange={setStartTime}
                      />
                    </Field>
                  </View>
                  <View className="flex-1">
                    {/* The field shows only the time: its name sits above it. */}
                    <Field label={t("rescheduleEndTime")}>
                      <TimeField
                        label={t("rescheduleEndTime")}
                        value={endTime}
                        onChange={setEndTime}
                      />
                    </Field>
                  </View>
                </View>
                {!severalDates && !setup.seated ? (
                  <View className="flex-row">
                    <Chip
                      label={t("rescheduleVenueToo")}
                      selected={venueToo}
                      onPress={() => {
                        if (venueToo) setPicked(null);
                        setVenueToo(!venueToo);
                      }}
                    />
                  </View>
                ) : null}
              </>
            ) : null}

            {mode === "venue" && setup.venue ? (
              <AppText variant="small">
                {t("rescheduleCurrentVenue", { venue: setup.venue })}
              </AppText>
            ) : null}
            {withVenue ? (
              <VenuePickerField picked={picked} onChange={setPicked} />
            ) : null}

            {mode === "postpone" ? (
              <AppText variant="meta">{t("reschedulePostponeHint")}</AppText>
            ) : null}

            <Field label={t("rescheduleMessage")}>
              <Input
                value={message}
                onChangeText={setMessage}
                placeholder={t("rescheduleMessagePlaceholder")}
                multiline
                maxLength={MAX_RESCHEDULE_MESSAGE}
                className="min-h-[110px]"
              />
            </Field>
            <AppText variant="meta">
              {mode === "postpone"
                ? t("reschedulePostponeWhoIsTold", { count: setup.holders })
                : refundUntil
                  ? t("rescheduleWhoIsTold", {
                      count: setup.holders,
                      refundUntil: when(refundUntil),
                    })
                  : t("rescheduleHolders", { count: setup.holders })}
            </AppText>
            {mode !== "postpone" && !severalDates ? (
              <AppText variant="meta">
                {t("rescheduleMovesLeft", {
                  left: setup.maxMoves - setup.moves,
                })}
              </AppText>
            ) : null}
            {problem === "too_soon" ? (
              <AppText variant="small" tone="error">
                {t("rescheduleTooSoonHint")}
              </AppText>
            ) : null}
            {problem === "unchanged" ? (
              <AppText variant="small" tone="error">
                {t("rescheduleUnchangedHint")}
              </AppText>
            ) : null}
            <Button
              title={submitLabel}
              fullWidth
              loading={move.isPending}
              disabled={move.isPending || problem !== null}
              onPress={confirmMove}
            />
          </>
        )}
      </KeyboardAwareScrollView>
    </>
  );
}
