// The pure rules of the "On Abonten" wall (docs/architecture/showcase.md).
// Which entries qualify is decided in SQL on every read
// (_showcase_subject_state); what the reader then shows is decided here,
// the same on the website, in the app and in the services.

import type {
  ShowcaseAudience,
  ShowcaseHostTile,
  ShowcasePlaceTile,
  ShowcaseTile,
} from "@abonten/types/showcaseType";
import {
  addCalendarDays,
  instantToWallClock,
  isValidTimeZone,
  startOfCalendarDay,
} from "../time/timeZone";

/** A row shows with at least this many entries unless staff set otherwise. */
export const SHOWCASE_DEFAULT_MIN_PER_ROW = 4;

/**
 * The rows that show. A row with fewer entries than `minPerRow` is left
 * out, because a wall of two or three names looks worse than none; null
 * when neither row is left, and the whole section hides.
 */
export function showcaseRowsToShow<
  H extends ShowcaseHostTile,
  P extends ShowcasePlaceTile,
>(
  rows: { hosts: H[]; places: P[] },
  minPerRow: number,
): { hosts: H[]; places: P[] } | null {
  const min = Number.isFinite(minPerRow)
    ? Math.max(1, Math.floor(minPerRow))
    : SHOWCASE_DEFAULT_MIN_PER_ROW;
  const hosts = rows.hosts.length >= min ? rows.hosts : [];
  const places = rows.places.length >= min ? rows.places : [];
  if (hosts.length === 0 && places.length === 0) return null;
  return { hosts, places };
}

/**
 * Who may see the wall. Signed-out visitors only when it is open to
 * everyone; beta testers when listed; staff (an active admin) otherwise.
 */
export async function showcaseAudienceIncludes(
  audience: ShowcaseAudience | string,
  betaUserIds: readonly string[],
  userId: string | null,
  isStaff: (userId: string) => Promise<boolean>,
): Promise<boolean> {
  if (audience === "all") return true;
  if (!userId) return false;
  if (audience === "beta" && betaUserIds.includes(userId)) return true;
  return isStaff(userId);
}

/** The line under a tile's name. */
export type ShowcaseNextUp =
  | {
      kind: "event";
      title: string;
      startsAt: string;
      endsAt: string | null;
      timezone: string;
      /** Running right now. */
      onNow: boolean;
      /** On today or this weekend, in the event's own zone: the dot. */
      soon: boolean;
    }
  | { kind: "open_now" }
  | {
      kind: "place_info";
      categorySlug: string | null;
      categoryName: string | null;
      area: string | null;
    };

/**
 * What a tile says under its name: a host's next event; a place's next
 * event there, else "Open now", else its category and area. Null when
 * there is nothing to say.
 */
export function showcaseNextUp(
  tile: ShowcaseTile,
  now: Date = new Date(),
): ShowcaseNextUp | null {
  const event = tile.nextEvent;
  if (event) {
    return {
      kind: "event",
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
      onNow: isOnNow(event.startsAt, event.endsAt, now),
      soon: isOnTodayOrThisWeekend(
        event.startsAt,
        event.endsAt,
        event.timezone,
        now,
      ),
    };
  }
  if (tile.kind === "host") return null;
  if (tile.openNow) return { kind: "open_now" };
  if (tile.categorySlug || tile.categoryName || tile.area) {
    return {
      kind: "place_info",
      categorySlug: tile.categorySlug,
      categoryName: tile.categoryName,
      area: tile.area,
    };
  }
  return null;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Started and not yet ended. */
export function isOnNow(
  startsAt: string | Date,
  endsAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  const start = toDate(startsAt);
  const end = toDate(endsAt);
  if (!start || !end) return false;
  return start.getTime() <= now.getTime() && end.getTime() > now.getTime();
}

/** 0 Sunday … 6 Saturday of a calendar day ("yyyy-mm-dd"). */
function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Whether an event is on today or this weekend, on the event's own clock:
 * running now, or a date that touches today, or this week's Friday to
 * Sunday (from Friday on, the rest of that weekend). An event that has
 * ended is not. An unknown zone is read as UTC.
 */
export function isOnTodayOrThisWeekend(
  startsAt: string | Date,
  endsAt: string | Date | null | undefined,
  zone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const start = toDate(startsAt);
  if (!start) return false;
  const end = toDate(endsAt);
  if (end && end.getTime() <= now.getTime()) return false;
  if (end && start.getTime() <= now.getTime()) return true;

  const z = isValidTimeZone(zone) ? zone : "UTC";
  const today = instantToWallClock(now, z).date;
  const dow = weekdayOf(today);
  const at = (days: number) =>
    startOfCalendarDay(addCalendarDays(today, days), z);

  const todayStart = at(0);
  const tomorrowStart = at(1);
  // Days to the coming Monday (a Monday counts to the next one).
  const toMonday = (8 - dow) % 7 || 7;
  const weekendEnd = at(toMonday);
  // Monday to Thursday: from the coming Friday; Friday to Sunday: from today.
  const weekendStart = dow >= 1 && dow <= 4 ? at(5 - dow) : todayStart;
  if (!todayStart || !tomorrowStart || !weekendEnd || !weekendStart) {
    return false;
  }

  const touches = (from: Date, to: Date) =>
    start.getTime() < to.getTime() &&
    (end ? end.getTime() > from.getTime() : start.getTime() >= from.getTime());
  return (
    touches(todayStart, tomorrowStart) || touches(weekendStart, weekendEnd)
  );
}
