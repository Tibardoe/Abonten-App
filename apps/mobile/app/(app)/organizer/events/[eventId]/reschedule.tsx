import { TimeField } from "@/components/datetime/TimeField";
import { DateRangeField } from "@/components/explore/DateRangeField";
import { api } from "@/lib/api";
import {
  MAX_RESCHEDULE_MESSAGE,
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

/** "yyyy-mm-dd" + "HH:MM" as a wall clock, a day later when `nextDay`. */
function wallClock(date: string, time: string, nextDay = false): string {
  if (!nextDay) return `${date}T${time}`;
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${next.toISOString().slice(0, 10)}T${time}`;
}

// Move an event that people already hold tickets for
// (docs/architecture/event-reschedule.md): a new date and a message.
// Everyone holding a ticket is told (notice, push, email) and may keep it or
// give it back for the ticket price and the service fee until the window
// closes. Mirrors the website's Manage › Details card;
// GET/POST /api/mobile/organizer/events/:id/reschedule.
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

  const [day, setDay] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const move = useMutation({
    mutationFn: () =>
      api.organizer.rescheduleEvent(id, {
        // Wall-clock times: the server reads them on the venue's clock.
        startsAt: wallClock(day as string, startTime as string),
        endsAt: wallClock(
          day as string,
          endTime as string,
          (endTime as string) <= (startTime as string),
        ),
        message,
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
  const startsAt =
    day && startTime
      ? parseEventTimestamp(wallClock(day, startTime), zone)
      : null;
  const endsAt =
    day && startTime && endTime
      ? parseEventTimestamp(wallClock(day, endTime, endTime <= startTime), zone)
      : null;
  const problem = setup.startsAt
    ? rescheduleProblem({
        startsAt,
        endsAt,
        message,
        currentStartsAt: new Date(setup.startsAt),
        currentEndsAt: setup.endsAt ? new Date(setup.endsAt) : null,
        moves: setup.moves,
      })
    : "dates";
  const refundUntil = startsAt ? rescheduleRefundUntil(startsAt) : null;

  const blockedText =
    setup.blocked === "not_published"
      ? t("rescheduleBlockedNotPublished")
      : setup.blocked === "several_dates"
        ? t("rescheduleBlockedSeveralDates")
        : setup.blocked === "started"
          ? t("rescheduleBlockedStarted")
          : setup.blocked === "too_many"
            ? t("rescheduleBlockedTooMany")
            : null;

  function confirmMove() {
    if (!startsAt || !refundUntil || problem) return;
    Alert.alert(
      t("rescheduleConfirmTitle", {
        title: setup?.title ?? "",
        when: when(startsAt),
      }),
      t("rescheduleConfirmBody", {
        count: setup?.holders ?? 0,
        refundUntil: when(refundUntil),
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
        {blockedText ? (
          <AppText variant="small">{blockedText}</AppText>
        ) : (
          <>
            {setup.startsAt ? (
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
                <TimeField
                  label={t("rescheduleStartTime")}
                  value={startTime}
                  onChange={setStartTime}
                />
              </View>
              <View className="flex-1">
                <TimeField
                  label={t("rescheduleEndTime")}
                  value={endTime}
                  onChange={setEndTime}
                />
              </View>
            </View>
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
              {refundUntil
                ? t("rescheduleWhoIsTold", {
                    count: setup.holders,
                    refundUntil: when(refundUntil),
                  })
                : t("rescheduleHolders", { count: setup.holders })}
            </AppText>
            <AppText variant="meta">
              {t("rescheduleMovesLeft", { left: setup.maxMoves - setup.moves })}
            </AppText>
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
              title={t("rescheduleSubmit")}
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
