// Client-safe TypeScript mirror of the SQL `place_is_open_now` function
// (see supabase/migrations/20260820090000_add_places_feature.sql), extended
// to also produce a human-readable label instead of just a boolean. No
// per-place timezone column exists (same single-timezone assumption already
// made elsewhere, e.g. proxy.ts's default "GH" country code), so this always
// evaluates against the caller's local time (`now`, defaulting to `new
// Date()` — the browser's local time on the client, the server's local time
// during SSR).

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

const TEMPORARY_STATUS_LABELS: Record<string, string> = {
  temporarily_closed: "Temporarily closed",
  permanently_closed: "Permanently closed",
};

function temporaryStatusLabel(status: string | null): string | null {
  if (!status) return null;
  return TEMPORARY_STATUS_LABELS[status] ?? "Closed";
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes ?? 0);
}

function formatTime(time: string): string {
  const totalMinutes = parseTimeToMinutes(time);
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
}

/**
 * Full detail-page version — needs the place's weekly `place_opening_hours`
 * rows (getPlaceBySlug.ts already fetches these). Mirrors place_is_open_now
 * exactly, including the overnight-range case (close_time <= open_time,
 * either today's range spilling past midnight, or yesterday's range still
 * open into today).
 */
export function computePlaceOpenStatus(
  openingHours: PlaceOpeningHourRow[],
  temporaryStatus: string | null,
  now: Date = new Date(),
): PlaceOpenStatus {
  const temporaryLabel = temporaryStatusLabel(temporaryStatus);
  if (temporaryLabel) {
    return { isOpen: false, label: temporaryLabel };
  }

  const dow = now.getDay();
  const yesterdayDow = (dow + 6) % 7;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const todayRow = openingHours.find((h) => h.day_of_week === dow);
  const yesterdayRow = openingHours.find((h) => h.day_of_week === yesterdayDow);

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
      return {
        isOpen: true,
        label: `Open now · Closes at ${formatTime(yesterdayRow.close_time)}`,
      };
    }
  }

  if (
    !todayRow ||
    todayRow.is_closed ||
    !todayRow.open_time ||
    !todayRow.close_time
  ) {
    return { isOpen: false, label: "Closed today" };
  }

  const openMin = parseTimeToMinutes(todayRow.open_time);
  const closeMin = parseTimeToMinutes(todayRow.close_time);
  const isOvernight = closeMin <= openMin;

  if (isOvernight) {
    if (nowMinutes >= openMin) {
      return {
        isOpen: true,
        label: `Open now · Closes at ${formatTime(todayRow.close_time)}`,
      };
    }
    return {
      isOpen: false,
      label: `Closed · Opens at ${formatTime(todayRow.open_time)}`,
    };
  }

  if (nowMinutes >= openMin && nowMinutes <= closeMin) {
    return {
      isOpen: true,
      label: `Open now · Closes at ${formatTime(todayRow.close_time)}`,
    };
  }

  if (nowMinutes < openMin) {
    return {
      isOpen: false,
      label: `Closed · Opens at ${formatTime(todayRow.open_time)}`,
    };
  }

  return { isOpen: false, label: "Closed" };
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
  isOpen: boolean,
  temporaryStatus: string | null,
): PlaceOpenStatus {
  const temporaryLabel = temporaryStatusLabel(temporaryStatus);
  if (temporaryLabel) {
    return { isOpen: false, label: temporaryLabel };
  }

  return isOpen
    ? { isOpen: true, label: "Open now" }
    : { isOpen: false, label: "Closed" };
}
