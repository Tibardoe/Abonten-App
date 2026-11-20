"use client";

import addEventShows from "@/actions/addEventShows";
import getEventShows from "@/actions/getEventShows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { actionUnreachable } from "@/utils/actionUnreachable";
import {
  type ShowRunSlot,
  type Weekday,
  expandShowRun,
  groupShowsByVenue,
  showRunProblemMessage,
} from "@abonten/core/showRuns";
import { formatInTimeZone } from "@abonten/core/time/timeZone";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import ShowVenueChooser, { type ShowVenueState } from "./ShowVenueChooser";

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** "HH:MM" plus minutes, as a wall-clock "yyyy-mm-ddTHH:MM" (no zone). */
function addMinutesToWallClock(date: string, time: string, minutes: number) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, hh, mm) + minutes * 60_000);
  return t.toISOString().slice(0, 16);
}

/**
 * Manage › Details: turn a listing into a run of shows, or copy it
 * (docs/architecture/show-runs.md). Each show is its own listing with its
 * own seats, door list and payout; the run is listed once to buyers, with
 * a show picker on each show's page. New shows and copies may be at another
 * venue in the same country (a tour).
 */
export default function ManageEventShowsCard({
  eventId,
  timeZone,
  startsAt,
  endsAt,
}: {
  eventId: string;
  timeZone: string;
  startsAt: string | null;
  endsAt: string | null;
}) {
  const t = useTranslations("events");
  const tc = useTranslations("core");
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const key = ["event-shows", eventId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => getEventShows(eventId),
    staleTime: 30_000,
  });
  const shows = data?.status === 200 ? data.data : [];
  const venues = groupShowsByVenue(shows);

  const defaultDuration =
    startsAt && endsAt
      ? Math.max(
          15,
          Math.round(
            (new Date(endsAt).getTime() - new Date(startsAt).getTime()) /
              60_000,
          ),
        )
      : 120;

  const [days, setDays] = useState<Weekday[]>([]);
  const [times, setTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [untilDate, setUntilDate] = useState("");
  const [duration, setDuration] = useState(String(defaultDuration));
  const [copyDate, setCopyDate] = useState("");
  const [copyTime, setCopyTime] = useState("");
  const [oneDate, setOneDate] = useState("");
  const [oneTime, setOneTime] = useState("");
  const [where, setWhere] = useState<ShowVenueState>({ mode: "same" });
  const venue = where.mode === "other" ? where.venue : null;
  const venueReady = where.mode === "same" || !!venue;
  const [pending, start] = useTransition();
  // One per submission: a retry after a lost answer makes nothing twice.
  const requestId = useRef(crypto.randomUUID());

  // 15 November 2026 was a Sunday: day d of that week, in the reader's words.
  const weekdayName = (d: Weekday) =>
    formatInTimeZone(
      new Date(Date.UTC(2026, 10, 15 + d, 12)),
      "UTC",
      { weekday: "short" },
      locale,
    );

  const slots: ShowRunSlot[] = useMemo(
    () => days.flatMap((weekday) => times.map((time) => ({ weekday, time }))),
    [days, times],
  );
  const preview = useMemo(
    () =>
      fromDate && untilDate
        ? expandShowRun(
            { fromDate, untilDate, slots, durationMinutes: Number(duration) },
            timeZone,
          )
        : null,
    [fromDate, untilDate, slots, duration, timeZone],
  );

  const add = (one: boolean) =>
    start(async () => {
      const res = await addEventShows({
        eventId,
        ...(one
          ? {
              // Wall-clock times: the server reads them on the venue's clock.
              shows: [
                {
                  startsAt: `${oneDate}T${oneTime}`,
                  endsAt: addMinutesToWallClock(
                    oneDate,
                    oneTime,
                    Number(duration),
                  ),
                },
              ],
            }
          : {
              rule: {
                fromDate,
                untilDate,
                slots,
                durationMinutes: Number(duration),
              },
            }),
        venue,
        clientRequestId: requestId.current,
      }).catch(actionUnreachable);
      if (res.status === 200 && "data" in res) {
        requestId.current = crypto.randomUUID();
        toast.success(res.message);
        // The whole form starts again: dates left from the last run would
        // quietly apply to the next one.
        setDays([]);
        setTimes([]);
        setFromDate("");
        setUntilDate("");
        setOneDate("");
        setOneTime("");
        qc.invalidateQueries({ queryKey: key });
        router.refresh();
      } else {
        toast.error(res.message ?? t("couldNotAddShows"));
      }
    });

  const copy = () =>
    start(async () => {
      const res = await addEventShows({
        eventId,
        // Wall-clock times: the server reads them on the venue's clock.
        shows: [
          {
            startsAt: `${copyDate}T${copyTime}`,
            endsAt: addMinutesToWallClock(copyDate, copyTime, Number(duration)),
          },
        ],
        separate: true,
        venue,
        clientRequestId: requestId.current,
      }).catch(actionUnreachable);
      if (res.status === 200 && "data" in res && res.data.shows[0]) {
        requestId.current = crypto.randomUUID();
        toast.success(res.message);
        router.push(`/manage/events/${res.data.shows[0].id}`);
      } else {
        toast.error(res.message ?? t("couldNotAddShows"));
      }
    });

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card p-4 text-card-foreground">
      <div>
        <h2 className="font-semibold text-lg">{t("showsTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("showsIntro")}</p>
      </div>

      {venues.map((group) => (
        <div key={group.key} className="space-y-1">
          {venues.length > 1 && (
            <p className="truncate text-sm font-medium">{group.label}</p>
          )}
          <ul className="space-y-1 text-sm">
            {group.shows.map((show) => (
              <li key={show.id} className="flex items-center justify-between">
                <Link
                  href={`/manage/events/${show.id}`}
                  className={
                    show.id === eventId ? "font-semibold" : "text-primary"
                  }
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
                </Link>
                <span className="text-muted-foreground">
                  {show.status === "canceled"
                    ? t("showCancelled")
                    : show.postponed
                      ? t("showPostponed")
                      : show.sold_out
                        ? t("showSoldOut")
                        : show.seats_left != null
                          ? t("showSeatsLeft", { count: show.seats_left })
                          : t("showOnSale")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <ShowVenueChooser value={where} onChange={setWhere} />

      <div className="space-y-1">
        <label htmlFor="run-duration" className="text-sm text-muted-foreground">
          {t("showLengthMinutes")}
        </label>
        <Input
          id="run-duration"
          type="number"
          min={15}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="w-32"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("addOneShow")}</p>
        <p className="text-xs text-muted-foreground">{t("addOneShowHint")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="date"
            aria-label={t("showDate")}
            value={oneDate}
            onChange={(e) => setOneDate(e.target.value)}
            className="w-auto"
          />
          <Input
            type="time"
            aria-label={t("showTimes")}
            value={oneTime}
            onChange={(e) => setOneTime(e.target.value)}
            className="w-auto"
          />
          <Button
            type="button"
            variant="outline"
            disabled={
              pending ||
              !oneDate ||
              !oneTime ||
              !venueReady ||
              !(Number(duration) >= 15)
            }
            onClick={() => add(true)}
          >
            {t("addThisShow")}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">{t("repeatWeekly")}</p>
        <p className="text-sm text-muted-foreground">{t("repeatOn")}</p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => {
            const on = days.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setDays((prev) =>
                    on ? prev.filter((x) => x !== d) : [...prev, d],
                  )
                }
                className={`rounded-full border px-3 py-1 text-sm ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border"
                }`}
              >
                {weekdayName(d)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label htmlFor="run-time" className="text-sm text-muted-foreground">
              {t("showTimes")}
            </label>
            <Input
              id="run-time"
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!newTime || times.includes(newTime)}
            onClick={() => {
              setTimes((prev) => [...prev, newTime].sort());
              setNewTime("");
            }}
          >
            {t("addTime")}
          </Button>
          {times.map((time) => (
            <button
              key={time}
              type="button"
              onClick={() => setTimes((prev) => prev.filter((x) => x !== time))}
              className="rounded-full bg-muted px-3 py-1 text-sm"
              aria-label={t("removeTime", { time })}
            >
              {time} ×
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="run-from" className="text-sm text-muted-foreground">
              {t("runFrom")}
            </label>
            <Input
              id="run-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label
              htmlFor="run-until"
              className="text-sm text-muted-foreground"
            >
              {t("runUntil")}
            </label>
            <Input
              id="run-until"
              type="date"
              value={untilDate}
              onChange={(e) => setUntilDate(e.target.value)}
            />
          </div>
        </div>

        {preview && !preview.ok && slots.length > 0 && (
          <p role="alert" className="text-sm text-destructive">
            {showRunProblemMessage(tc, preview.problem)}
          </p>
        )}

        <Button
          type="button"
          className="w-full"
          disabled={pending || !preview || !preview.ok || !venueReady}
          onClick={() => add(false)}
        >
          {preview?.ok
            ? t("addShowsCount", { count: preview.shows.length })
            : t("addShows")}
        </Button>
      </div>

      <hr className="border-border" />

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("makeACopy")}</p>
        <p className="text-xs text-muted-foreground">{t("makeACopyHint")}</p>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="date"
            aria-label={t("copyDate")}
            value={copyDate}
            onChange={(e) => setCopyDate(e.target.value)}
            className="w-auto"
          />
          <Input
            type="time"
            aria-label={t("copyTime")}
            value={copyTime}
            onChange={(e) => setCopyTime(e.target.value)}
            className="w-auto"
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending || !copyDate || !copyTime || !venueReady}
            onClick={copy}
          >
            {t("makeACopy")}
          </Button>
        </div>
      </div>
    </div>
  );
}
