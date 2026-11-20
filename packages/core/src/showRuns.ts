// Runs of shows (docs/architecture/show-runs.md): "every Friday at 4pm,
// Saturday at 4pm and 8pm, from 4 to 13 September" turned into the show
// times, in the event's own time zone. Used by the organizer forms (the
// preview) and by @abonten/services events/eventShowsCore (the authority).

import type { CoreTranslator } from "./i18n/translator";
import { addCalendarDays, wallClockToInstant } from "./time/timeZone";

/** Shows one request may add (a two-month daily run, or 13 weekends). */
export const MAX_SHOWS_PER_REQUEST = 60;

/** How far ahead a run may reach. */
export const MAX_RUN_DAYS = 366;

/** 0 = Sunday … 6 = Saturday, like Date.getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type ShowRunSlot = { weekday: Weekday; time: string };

export type ShowRunRule = {
  /** First calendar day of the run, "yyyy-mm-dd" (the event's calendar). */
  fromDate: string;
  /** Last calendar day, inclusive. */
  untilDate: string;
  /** The weekly times: a weekday and a "HH:MM" each. */
  slots: ShowRunSlot[];
  /** How long each show lasts. */
  durationMinutes: number;
};

export type ShowTime = { startsAt: string; endsAt: string };

export type ShowRunProblem =
  | "no_slots"
  | "bad_slot"
  | "bad_range"
  | "too_long"
  | "bad_duration"
  | "none_ahead"
  | "too_many";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

/**
 * The shows a rule makes, earliest first, skipping any that would start
 * before `now`. Times are wall-clock times in `timeZone` (the venue's).
 */
export function expandShowRun(
  rule: ShowRunRule,
  timeZone: string,
  now: Date = new Date(),
): { ok: true; shows: ShowTime[] } | { ok: false; problem: ShowRunProblem } {
  if (!rule.slots || rule.slots.length === 0) {
    return { ok: false, problem: "no_slots" };
  }
  for (const slot of rule.slots) {
    if (
      !Number.isInteger(slot.weekday) ||
      slot.weekday < 0 ||
      slot.weekday > 6 ||
      !TIME_RE.test(slot.time)
    ) {
      return { ok: false, problem: "bad_slot" };
    }
  }
  if (
    !DATE_RE.test(rule.fromDate) ||
    !DATE_RE.test(rule.untilDate) ||
    daysBetween(rule.fromDate, rule.untilDate) < 0
  ) {
    return { ok: false, problem: "bad_range" };
  }
  if (daysBetween(rule.fromDate, rule.untilDate) > MAX_RUN_DAYS) {
    return { ok: false, problem: "too_long" };
  }
  if (
    !Number.isInteger(rule.durationMinutes) ||
    rule.durationMinutes < 15 ||
    rule.durationMinutes > 24 * 60
  ) {
    return { ok: false, problem: "bad_duration" };
  }

  const times = [...new Set(rule.slots.map((s) => `${s.weekday}|${s.time}`))]
    .map((key) => {
      const [weekday, time] = key.split("|");
      return { weekday: Number(weekday), time };
    })
    .sort((a, b) => a.time.localeCompare(b.time));

  const shows: ShowTime[] = [];
  const total = daysBetween(rule.fromDate, rule.untilDate);
  for (let i = 0; i <= total; i++) {
    const day = addCalendarDays(rule.fromDate, i);
    const weekday = weekdayOf(day);
    for (const slot of times) {
      if (slot.weekday !== weekday) continue;
      const start = wallClockToInstant(day, slot.time, timeZone);
      if (!start || start.getTime() <= now.getTime()) continue;
      const end = new Date(start.getTime() + rule.durationMinutes * 60_000);
      shows.push({ startsAt: start.toISOString(), endsAt: end.toISOString() });
      if (shows.length > MAX_SHOWS_PER_REQUEST) {
        return { ok: false, problem: "too_many" };
      }
    }
  }
  if (shows.length === 0) return { ok: false, problem: "none_ahead" };
  return { ok: true, shows };
}

export function showRunProblemMessage(
  t: CoreTranslator,
  problem: ShowRunProblem,
): string {
  switch (problem) {
    case "no_slots":
      return t("showRuns.noSlots");
    case "bad_slot":
      return t("showRuns.badSlot");
    case "bad_range":
      return t("showRuns.badRange");
    case "too_long":
      return t("showRuns.tooLong", { days: MAX_RUN_DAYS });
    case "bad_duration":
      return t("showRuns.badDuration");
    case "none_ahead":
      return t("showRuns.noneAhead");
    case "too_many":
      return t("showRuns.tooMany", { max: MAX_SHOWS_PER_REQUEST });
  }
}

/** A show's venue, as get_event_shows returns it (tours). */
export type ShowVenueFields = {
  place_id?: string | null;
  venue_name?: string | null;
  venue_address?: string | null;
};

/** What a heading shows for a venue: the place's name, else the address. */
export function showVenueLabel(show: ShowVenueFields): string {
  return show.venue_name?.trim() || show.venue_address?.trim() || "";
}

export type ShowVenueGroup<T> = { key: string; label: string; shows: T[] };

/**
 * A run's shows by venue (a tour): venues in the order of their first show,
 * each venue's shows in the order given. A run that stays at one venue is
 * one group.
 */
export function groupShowsByVenue<T extends ShowVenueFields>(
  shows: readonly T[],
): ShowVenueGroup<T>[] {
  const groups = new Map<string, ShowVenueGroup<T>>();
  for (const show of shows) {
    const key =
      show.place_id ?? (show.venue_address ?? "").trim().toLowerCase();
    const group = groups.get(key);
    if (group) group.shows.push(show);
    else groups.set(key, { key, label: showVenueLabel(show), shows: [show] });
  }
  return [...groups.values()];
}
