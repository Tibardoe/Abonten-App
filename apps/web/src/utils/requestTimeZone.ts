import "server-only";
import { TIME_ZONE_COOKIE_NAME } from "@/i18n/config";
import { calendarZoneOrDefault } from "@abonten/services/markets/calendarZone";
import { cookies } from "next/headers";

/**
 * The zone "today" and "this month" are counted in for this request: the
 * visitor's browser zone (the `abn_tz` cookie LocaleProvider writes), else
 * the default market's. The cookie is used only after it validates as a
 * zone name.
 */
export async function requestTimeZone(): Promise<string> {
  let raw: string | null = null;
  try {
    const value = (await cookies()).get(TIME_ZONE_COOKIE_NAME)?.value;
    raw = value ? decodeURIComponent(value) : null;
  } catch {
    // Outside a request: fall through to the market's zone.
  }
  return calendarZoneOrDefault(raw);
}
