import { logger } from "@abonten/core/logger";
import { isValidTimeZone } from "@abonten/core/time";
import { getDefaultMarket } from "./marketConfig";

/**
 * The zone to count "today" and "this month" in: the viewer's own (from
 * their browser or phone) when it is a real zone name, else the default
 * market's (Africa/Accra — UTC, so older app builds that send nothing get
 * exactly the answer they always did).
 */
export async function calendarZoneOrDefault(
  candidate: string | null | undefined,
): Promise<string> {
  if (isValidTimeZone(candidate)) return candidate;
  try {
    return (await getDefaultMarket()).defaultTimeZone;
  } catch (error) {
    logger.warn(
      "calendarZoneOrDefault: no default market zone, using UTC",
      error,
    );
    return "UTC";
  }
}
