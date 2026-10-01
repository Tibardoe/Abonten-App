import type { CoreTranslator } from "./i18n/translator";

// "Expires in Xh" / "Expires in Xm" for draft cards — deliberately coarse
// (no live countdown) since expiry is only ever checked authoritatively by
// the server on continue/list, this is just an advance-warning hint. The
// words live under `expires.*` of the core namespace.
export function formatExpiresIn(
  t: CoreTranslator,
  expiresAt: string | Date,
): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();

  if (diffMs <= 0) return t("expires.expired");

  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0
      ? t("expires.daysHours", { days, hours: remainingHours })
      : t("expires.days", { days });
  }

  if (hours >= 1) {
    return t("expires.hours", { hours });
  }

  return t("expires.minutes", { minutes: Math.max(minutes, 1) });
}
