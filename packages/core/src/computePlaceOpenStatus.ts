import { intlLocale } from "./i18n/coreStrings";
import type { CoreTranslator } from "./i18n/translator";
import { instantToWallClock, isValidTimeZone } from "./time/timeZone";

// Client-safe TypeScript mirror of the SQL `place_is_open_now` function
// (see supabase/migrations/20260820090000_add_places_feature.sql), extended
// to also produce a human-readable label instead of just a boolean.
// Opening hours are the PLACE's wall-clock times: pass place.timezone and
// they are read on its clock (as the SQL function does); without a zone the
// caller's local time is used, which is only right for a viewer beside it.
// Labels come from `openStatus.*` of the core namespace, the clock time
// from Intl in the reader's language.

export type PlaceOpeningHourRow = {
  day_of_week: number; // 0 (Sunday) .. 6 (Saturday) — matches Date.getDay()
  open_time: string | null; // "HH:MM" or "HH:MM:SS"
  close_time: string | null;
  is_closed: boolean;
};

export type PlaceOpenStatus = {
  label: string;
  isOpen: boolean;
};

/** The reader's translator and language, for the label and its clock time. */
export type OpenStatusI18n = { t: CoreTranslator; locale?: string | null };

function temporaryStatusLabel(
  t: CoreTranslator,
  status: string | null,
): string | null {
  if (!status) return null;
  if (status === "temporarily_closed") return t("openStatus.temporarilyClosed");
  if (status === "permanently_closed") return t("openStatus.permanentlyClosed");
  return t("openStatus.closed");
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes ?? 0);
}

const clockCache = new Map<string, Intl.DateTimeFormat>();

/** "5:00 PM" in English, "17:00" in French — a wall-clock time, no zone. */
export function formatClockTime(time: string, locale?: string | null): string {
  const totalMinutes = parseTimeToMinutes(time);
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const tag = intlLocale(locale);
  let f = clockCache.get(tag);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(tag, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        // British English would otherwise print "17:00"; the product's
        // English clock is 12-hour.
        ...(tag === "en-GB" ? { hour12: true } : {}),
      });
    } catch {
      f = new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        hour12: true,
      });
    }
    clockCache.set(tag, f);
  }
  const text = f.format(new Date(Date.UTC(2024, 0, 1, hours24, minutes)));
  // en-GB with hour12 gives "5:00 pm"; the product writes "5:00 PM".
  return tag === "en-GB"
    ? text.replace(/\s?(am|pm)$/i, (m) => m.toUpperCase())
    : text;
}

/** Weekday (0 Sunday) and minutes past midnight at the place. */
export function placeLocalNow(
  now: Date,
  timeZone?: string | null,
): { dow: number; minutes: number } {
  if (!timeZone || !isValidTimeZone(timeZone)) {
    return {
      dow: now.getDay(),
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
  const w = instantToWallClock(now, timeZone);
  const [y, m, d] = w.date.split("-").map(Number);
  const [hh, mm] = w.time.split(":").map(Number);
  return {
    dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(),
    minutes: hh * 60 + mm,
  };
}

export function computePlaceOpenStatus(
  i18n: OpenStatusI18n,
  openingHours: PlaceOpeningHourRow[],
  temporaryStatus: string | null,
  now: Date = new Date(),
  /**
   * The place's own zone (place.timezone). Opening hours are its local
   * wall-clock times; reading them on the viewer's or server's clock would
   * say a London café is closed when it is open.
   */
  timeZone?: string | null,
): PlaceOpenStatus {
  const { t, locale } = i18n;
  const temporaryLabel = temporaryStatusLabel(t, temporaryStatus);
  if (temporaryLabel) {
    return { isOpen: false, label: temporaryLabel };
  }

  const local = placeLocalNow(now, timeZone);
  const dow = local.dow;
  const yesterdayDow = (dow + 6) % 7;
  const nowMinutes = local.minutes;

  const todayRow = openingHours.find((h) => h.day_of_week === dow);
  const yesterdayRow = openingHours.find((h) => h.day_of_week === yesterdayDow);

  const openUntil = (close: string) => ({
    isOpen: true,
    label: t("openStatus.openClosesAt", {
      time: formatClockTime(close, locale),
    }),
  });
  const closedUntil = (open: string) => ({
    isOpen: false,
    label: t("openStatus.closedOpensAt", {
      time: formatClockTime(open, locale),
    }),
  });

  // Still open from yesterday's overnight range spilling past midnight into
  // today (mirrors place_is_open_now's second EXISTS clause).
  if (
    yesterdayRow &&
    !yesterdayRow.is_closed &&
    yesterdayRow.open_time &&
    yesterdayRow.close_time
  ) {
    const yOpen = parseTimeToMinutes(yesterdayRow.open_time);
    const yClose = parseTimeToMinutes(yesterdayRow.close_time);
    if (yClose <= yOpen && nowMinutes < yClose) {
      return openUntil(yesterdayRow.close_time);
    }
  }

  if (
    !todayRow ||
    todayRow.is_closed ||
    !todayRow.open_time ||
    !todayRow.close_time
  ) {
    return { isOpen: false, label: t("openStatus.closedToday") };
  }

  const openMin = parseTimeToMinutes(todayRow.open_time);
  const closeMin = parseTimeToMinutes(todayRow.close_time);
  const isOvernight = closeMin <= openMin;

  if (isOvernight) {
    if (nowMinutes >= openMin) return openUntil(todayRow.close_time);
    return closedUntil(todayRow.open_time);
  }

  if (nowMinutes >= openMin && nowMinutes <= closeMin) {
    return openUntil(todayRow.close_time);
  }

  if (nowMinutes < openMin) return closedUntil(todayRow.open_time);

  return { isOpen: false, label: t("openStatus.closed") };
}

/**
 * Whether the place is open right now, without any wording — for code that
 * sorts or filters (a list action, a map pin) and never shows the label.
 */
export function isPlaceOpenNow(
  openingHours: PlaceOpeningHourRow[],
  temporaryStatus: string | null,
  now: Date = new Date(),
  timeZone?: string | null,
): boolean {
  return computePlaceOpenStatus(
    { t: (key) => key },
    openingHours,
    temporaryStatus,
    now,
    timeZone,
  ).isOpen;
}

/**
 * Lightweight card/list-context version. List RPCs (get_nearby_places /
 * get_filtered_places) already compute `is_open` in SQL via
 * place_is_open_now, and PlaceType carries `temporary_status` but not the
 * full opening_hours rows — so PlaceCard can't call computePlaceOpenStatus
 * above. This derives the same {label, isOpen} shape from that precomputed
 * boolean instead, sharing the temporary-status label text so the two never
 * disagree on wording.
 */
export function derivePlaceCardOpenStatus(
  t: CoreTranslator,
  isOpen: boolean,
  temporaryStatus: string | null,
): PlaceOpenStatus {
  const temporaryLabel = temporaryStatusLabel(t, temporaryStatus);
  if (temporaryLabel) {
    return { isOpen: false, label: temporaryLabel };
  }

  return isOpen
    ? { isOpen: true, label: t("openStatus.openNow") }
    : { isOpen: false, label: t("openStatus.closed") };
}
