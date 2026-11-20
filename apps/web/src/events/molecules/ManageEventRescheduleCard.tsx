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

/**
 * Manage › Details: move an event that people already hold tickets for to a
 * new date (docs/architecture/event-reschedule.md). Everyone holding a
 * ticket is told (notice, push, email) and may keep it or give it back for
 * the ticket price and the service fee until the refund window closes.
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

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
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

  const startsAt =
    date && startTime
      ? parseEventTimestamp(wallClock(date, startTime), timeZone)
      : null;
  const endsAt =
    date && startTime && endTime
      ? parseEventTimestamp(
          wallClock(date, endTime, endTime <= startTime),
          timeZone,
        )
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

  async function submit() {
    if (!startsAt || !endsAt || !refundUntil || problem) return;
    const ok = await confirm({
      title: t("rescheduleConfirmTitle", { title, when: when(startsAt) }),
      message: t("rescheduleConfirmBody", {
        count: setup?.holders ?? 0,
        refundUntil: when(refundUntil),
      }),
      confirmLabel: t("rescheduleSubmit"),
    });
    if (!ok) return;
    start(async () => {
      const res = await rescheduleEvent({
        eventId,
        startsAt: wallClock(date, startTime),
        endsAt: wallClock(date, endTime, endTime <= startTime),
        message,
      }).catch(actionUnreachable);
      if (res.status === 200) {
        toast.success(res.message);
        setDate("");
        setStartTime("");
        setEndTime("");
        setMessage("");
        qc.invalidateQueries({ queryKey: key });
        qc.invalidateQueries({ queryKey: ["event-shows", eventId] });
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldNotMoveEvent"));
      }
    });
  }

  const blockedText =
    setup.blocked === "several_dates"
      ? t("rescheduleBlockedSeveralDates")
      : setup.blocked === "started"
        ? t("rescheduleBlockedStarted")
        : setup.blocked === "too_many"
          ? t("rescheduleBlockedTooMany")
          : null;

  return (
    <section className="space-y-4 rounded-xl border p-4">
      <div className="space-y-1">
        <h3 className="font-semibold">{t("rescheduleTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("rescheduleIntro")}</p>
      </div>

      {blockedText ? (
        <p className="text-sm">{blockedText}</p>
      ) : (
        <>
          {setup.startsAt && (
            <p className="text-sm">
              {t("rescheduleCurrent", { when: when(setup.startsAt) })}
            </p>
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
            {refundUntil
              ? t("rescheduleWhoIsTold", {
                  count: setup.holders,
                  refundUntil: when(refundUntil),
                })
              : t("rescheduleHolders", { count: setup.holders })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("rescheduleMovesLeft", {
              left: setup.maxMoves - setup.moves,
            })}
          </p>
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
            {t("rescheduleSubmit")}
          </Button>
        </>
      )}
    </section>
  );
}
