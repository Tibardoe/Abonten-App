// Time in the zone an event or place actually lives in.
//
// Every event carries `timezone` (IANA name such as "Europe/London",
// resolved on the server from its coordinates when it is saved). The
// organizer types wall-clock times in THAT zone — "7 pm" for a London event
// means 19:00 in London whether they are sitting in Accra or Lagos — and the
// database stores the instant. Viewers see the event's local time, plus
// their own when it differs.
//
// Built on Intl (present on Node, browsers and Hermes) plus @date-fns/tz for
// the wall-clock -> instant direction, which Intl alone cannot do.

import { TZDate } from "@date-fns/tz";

export type WallClock = {
  /** yyyy-mm-dd */
  date: string;
  /** HH:MM (24 h) */
  time: string;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "yyyy-mm-ddTHH:MM" or "yyyy-mm-ddTHH:MM:SS" with no zone designator. */
const WALL_CLOCK_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

const zoneCache = new Map<string, boolean>();

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone) return false;
  const cached = zoneCache.get(zone);
  if (cached != null) return cached;
  let ok = false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    ok = true;
  } catch {
    ok = false;
  }
  zoneCache.set(zone, ok);
  return ok;
}

/**
 * The instant at which a wall-clock date and time happens in `zone`.
 * Returns null for malformed parts. Non-existent local times (a spring-
 * forward gap) resolve to the instant after the gap, the same choice
 * calendars make.
 */
export function wallClockToInstant(
  date: string,
  time: string,
  zone: string,
): Date | null {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t || !isValidTimeZone(zone)) return null;
  const [, y, m, day] = d;
  const [, hh, mm] = t;
  const tz = new TZDate(
    Number(y),
    Number(m) - 1,
    Number(day),
    Number(hh),
    Number(mm),
    0,
    0,
    zone,
  );
  const out = new Date(tz.getTime());
  return Number.isNaN(out.getTime()) ? null : out;
}

/**
 * Interprets an API timestamp. A value with a zone designator ("...Z",
 * "...+01:00") is an instant; a bare "yyyy-mm-ddTHH:MM" is a wall-clock time
 * in `zone`. This is how the event services accept both today's clients
 * (which send instants) and clients that send what the organizer typed.
 */
export function parseEventTimestamp(
  value: string | null | undefined,
  zone: string,
): Date | null {
  if (!value) return null;
  const text = value.trim();
  if (WALL_CLOCK_ISO_RE.test(text)) {
    const [date, rest] = text.split("T");
    return wallClockToInstant(date, rest.slice(0, 5), zone);
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

type Parts = Record<string, string>;

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(zone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(zone);
  if (cached) return cached;
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  partsFormatterCache.set(zone, f);
  return f;
}

function partsIn(date: Date, zone: string): Parts {
  const out: Parts = {};
  for (const p of partsFormatter(zone).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  // Some ICU builds print "24" for midnight under h23; normalise.
  if (out.hour === "24") out.hour = "00";
  return out;
}

/** The wall-clock date and time of an instant in `zone`. */
export function instantToWallClock(date: Date, zone: string): WallClock {
  const p = partsIn(date, zone);
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
  };
}

/** Offset of `zone` from UTC at `date`, in minutes (London in July: 60). */
export function zoneOffsetMinutes(date: Date, zone: string): number {
  const p = partsIn(date, zone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

/** "GMT", "BST", "WAT", "GMT+1" — the short name for the zone at `date`. */
export function zoneAbbreviation(
  date: Date,
  zone: string,
  locale = "en-GB",
): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? zone;
  } catch {
    return zone;
  }
}

/** Two instants fall on the same calendar day in `zone`. */
export function sameDayInZone(a: Date, b: Date, zone: string): boolean {
  return instantToWallClock(a, zone).date === instantToWallClock(b, zone).date;
}

/** The viewer's own zone (device / browser), or UTC if unavailable. */
export function viewerTimeZone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(z) ? z : "UTC";
  } catch {
    return "UTC";
  }
}

/** Formats an instant in a zone with Intl options, safely. */
export function formatInTimeZone(
  date: Date | string,
  zone: string,
  options: Intl.DateTimeFormatOptions,
  locale = "en-GB",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const tz = isValidTimeZone(zone) ? zone : "UTC";
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: tz }).format(
      d,
    );
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      ...options,
      timeZone: tz,
    }).format(d);
  }
}

/**
 * The wall-clock string ("yyyy-mm-ddTHH:MM") a person typed, from a Date the
 * client built in its own zone. Sent to the server, which reads it in the
 * VENUE's zone — so "7 pm" means 7 pm at the event wherever the organizer
 * sits. Never use toISOString() for an event time.
 */
export function toWallClockString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "yyyy-mm-dd" + "HH:MM" -> wall-clock string, or null if either is malformed. */
export function wallClockString(date: string, time: string): string | null {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  return `${date}T${time}`;
}
