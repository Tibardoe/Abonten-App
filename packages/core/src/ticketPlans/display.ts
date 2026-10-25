import { isEnglishLike } from "../i18n/coreStrings";
import { formatDateTime } from "../i18n/format";

// How a plan's moments read: on the EVENT's clock (event.timezone), in the
// reader's language — "Fri 18 Dec, 6:00 pm" in English (the app's English
// clock is twelve-hour), "ven. 18 déc., 18:00" elsewhere (two-digit hours,
// like the app's other clocks). A deadline in the reader's own zone would be
// wrong by hours for anyone reading from elsewhere.

function validZone(timeZone: string | null | undefined): string | undefined {
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

export function planMomentText(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
  locale: string | null | undefined,
): string {
  return formatDateTime(iso, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    minute: "2-digit",
    ...(isEnglishLike(locale)
      ? { hour: "numeric", hour12: true }
      : { hour: "2-digit" }),
    timeZone: validZone(timeZone),
  });
}

/** The day only ("Fri 18 Dec"), for short labels. */
export function planDayText(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
  locale: string | null | undefined,
): string {
  return formatDateTime(iso, locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: validZone(timeZone),
  });
}
