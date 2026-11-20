"use client";

import getRescheduleSetup from "@/actions/getRescheduleSetup";
import rescheduleEvent from "@/actions/rescheduleEvent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import VenuePicker, { type PickedVenue } from "./VenuePicker";

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

/**
 * Manage › Details: move an event that people already hold tickets for
 * (docs/architecture/event-reschedule.md) to a new date, a new venue or
 * both; move one date of an event with several dates; or postpone it with
 * no new date yet. Everyone holding a ticket is told (notice, push, email)
 * and may keep it or give it back for the ticket price and the service fee
 * until the refund window closes (while postponed: until the new date).
 */
export default function ManageEventRescheduleCard({
  eventId,
  title,
  timeZone,
}: {
  eventId: string;
  title: string;
  timeZone: string;
}) {
  const t = useTranslations("events");
  const locale = useLocale();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const qc = useQueryClient();
  const key = ["reschedule-setup", eventId];
  const { data, isError } = useQuery({
    queryKey: key,
    queryFn: () => getRescheduleSetup(eventId),
    staleTime: 30_000,
  });
  const setup = data?.status === 200 ? data.data : null;

  const [mode, setMode] = useState<Mode>("date");
  const [occurrenceId, setOccurrenceId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [venueToo, setVenueToo] = useState(false);
  const [picked, setPicked] = useState<PickedVenue>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  if (isError || (data && data.status !== 200)) {
    return (
      <section className="space-y-2 rounded-xl border p-4">
        <h3 className="font-semibold">{t("rescheduleTitle")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("rescheduleCouldNotLoad")}
        </p>
      </section>
    );
  }
  if (!setup) return null;

  const when = (iso: string | Date) =>
    formatInTimeZone(iso, timeZone, WHEN, locale);
  const severalDates = setup.dates.length > 0;
  const postponed = !!setup.postponedAt;
  const chosenDate = severalDates
    ? (setup.dates.find((d) => d.id === occurrenceId) ?? null)
    : null;
  // The venue changes alone, or with the date.
  const withVenue = mode === "venue" || (mode === "date" && venueToo);

  const startsAt =
    mode === "date" && date && startTime
      ? parseEventTimestamp(wallClock(date, startTime), timeZone)
      : null;
  const endsAt =
    mode === "date" && date && startTime && endTime
      ? parseEventTimestamp(
          wallClock(date, endTime, endTime <= startTime),
          timeZone,
        )
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

  // The date the refund window counts to.
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

  function reset() {
    setDate("");
    setStartTime("");
    setEndTime("");
    setMessage("");
    setVenueToo(false);
    setPicked(null);
    setOccurrenceId(null);
    setMode("date");
  }

  async function submit() {
    if (problem || !setup) return;
    const confirmed = await confirm(
      mode === "postpone"
        ? {
            title: t("reschedulePostponeConfirmTitle", { title }),
            message: t("reschedulePostponeConfirmBody", {
              count: setup.holders,
            }),
            confirmLabel: t("reschedulePostponeSubmit"),
          }
        : {
            title:
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
            message: t("rescheduleConfirmBody", {
              count: setup.holders,
              refundUntil: refundUntil ? when(refundUntil) : "",
            }),
            confirmLabel: t("rescheduleSubmit"),
          },
    );
    if (!confirmed) return;
    start(async () => {
      const res = await rescheduleEvent({
        eventId,
        message,
        ...(mode === "postpone"
          ? { postpone: true }
          : {
              occurrenceId: chosenDate?.id ?? null,
              startsAt: mode === "date" ? wallClock(date, startTime) : null,
              endsAt:
                mode === "date"
                  ? wallClock(date, endTime, endTime <= startTime)
                  : null,
              venue: withVenue ? (picked?.venue ?? null) : null,
            }),
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message);
        reset();
        qc.invalidateQueries({ queryKey: key });
        qc.invalidateQueries({ queryKey: ["event-shows", eventId] });
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldNotMoveEvent"));
      }
    });
  }

  const blockedText =
    setup.blocked === "started"
      ? t("rescheduleBlockedStarted")
      : setup.blocked === "too_many"
        ? t("rescheduleBlockedTooMany")
        : setup.blocked === "not_published"
          ? t("rescheduleBlockedNotPublished")
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

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="space-y-1">
        <h3 className="font-semibold">{t("rescheduleTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("rescheduleIntro")}</p>
      </div>

      {postponed && setup.postponedAt && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          {t("reschedulePostponedNow", { when: when(setup.postponedAt) })}
        </p>
      )}

      {blockedText ? (
        <p className="text-sm">{blockedText}</p>
      ) : (
        <>
          {modes.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {modes.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    mode === m
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border"
                  }`}
                >
                  {modeLabel(m)}
                </button>
              ))}
            </div>
          )}
          {setup.seated && !postponed && (
            <p className="text-xs text-muted-foreground">
              {t("rescheduleSeatedNoVenue")}
            </p>
          )}

          {mode === "date" && (
            <>
              {severalDates ? (
                <div className="space-y-1">
                  <label
                    htmlFor="move-which"
                    className="text-sm text-muted-foreground"
                  >
                    {t("rescheduleWhichDate")}
                  </label>
                  <select
                    id="move-which"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={occurrenceId ?? ""}
                    onChange={(e) => setOccurrenceId(e.target.value || null)}
                  >
                    <option value="">{t("rescheduleChooseDate")}</option>
                    {setup.dates.map((d) => (
                      <option
                        key={d.id}
                        value={d.id}
                        disabled={d.moves >= setup.maxMoves}
                      >
                        {d.moves >= setup.maxMoves
                          ? t("rescheduleDateMovedTwice", {
                              when: when(d.startsAt),
                            })
                          : when(d.startsAt)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                setup.startsAt &&
                !postponed && (
                  <p className="text-sm">
                    {t("rescheduleCurrent", { when: when(setup.startsAt) })}
                  </p>
                )
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label
                    htmlFor="move-date"
                    className="text-sm text-muted-foreground"
                  >
                    {t("rescheduleNewDate")}
                  </label>
                  <Input
                    id="move-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="move-start"
                    className="text-sm text-muted-foreground"
                  >
                    {t("rescheduleStartTime")}
                  </label>
                  <Input
                    id="move-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="move-end"
                    className="text-sm text-muted-foreground"
                  >
                    {t("rescheduleEndTime")}
                  </label>
                  <Input
                    id="move-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
              {!severalDates && !setup.seated && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={venueToo}
                    onChange={(e) => {
                      setVenueToo(e.target.checked);
                      if (!e.target.checked) setPicked(null);
                    }}
                  />
                  {t("rescheduleVenueToo")}
                </label>
              )}
            </>
          )}

          {mode === "venue" && setup.venue && (
            <p className="text-sm">
              {t("rescheduleCurrentVenue", { venue: setup.venue })}
            </p>
          )}
          {withVenue && <VenuePicker picked={picked} onChange={setPicked} />}

          {mode === "postpone" && (
            <p className="text-sm text-muted-foreground">
              {t("reschedulePostponeHint")}
            </p>
          )}

          <div className="space-y-1">
            <label
              htmlFor="move-message"
              className="text-sm text-muted-foreground"
            >
              {t("rescheduleMessage")}
            </label>
            <Textarea
              id="move-message"
              value={message}
              maxLength={MAX_RESCHEDULE_MESSAGE}
              rows={4}
              placeholder={t("rescheduleMessagePlaceholder")}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {mode === "postpone"
              ? t("reschedulePostponeWhoIsTold", { count: setup.holders })
              : refundUntil
                ? t("rescheduleWhoIsTold", {
                    count: setup.holders,
                    refundUntil: when(refundUntil),
                  })
                : t("rescheduleHolders", { count: setup.holders })}
          </p>
          {mode !== "postpone" && !severalDates && (
            <p className="text-sm text-muted-foreground">
              {t("rescheduleMovesLeft", {
                left: setup.maxMoves - setup.moves,
              })}
            </p>
          )}
          {problem === "too_soon" && (
            <p className="text-sm text-destructive">
              {t("rescheduleTooSoonHint")}
            </p>
          )}
          {problem === "unchanged" && (
            <p className="text-sm text-destructive">
              {t("rescheduleUnchangedHint")}
            </p>
          )}
          <Button
            type="button"
            onClick={submit}
            disabled={pending || problem !== null}
          >
            {submitLabel}
          </Button>
        </>
      )}
    </section>
  );
}
