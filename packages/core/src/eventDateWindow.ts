import {
  addCalendarDays,
  instantToWallClock,
  startOfCalendarDay,
  startOfDayInZone,
  startOfMonthInZone,
} from "./time/timeZone";

// "Today" and "this month" on a reader's calendar, for the Explore rows
// (get_explore_event_sections) and the lists behind them
// (get_events_in_window, get_filtered_events). Which events fall inside is
// decided in the database; this only says where the day and the month end.

/**
 * Today's first and last moment and the last moment of this month, on
 * `zone`'s calendar (what server rendering must use: the server's own clock
 * is UTC).
 */
export function windowBoundsInZone(now: Date, zone: string) {
  const todayStart = startOfDayInZone(now, zone);
  const tomorrowStart =
    startOfCalendarDay(
      addCalendarDays(instantToWallClock(todayStart, zone).date, 1),
      zone,
    ) ?? new Date(todayStart.getTime() + 86_400_000);
  const nextMonthStart = startOfMonthInZone(now, zone, 1);
  return {
    todayStart,
    todayEnd: new Date(tomorrowStart.getTime() - 1),
    endOfMonth: new Date(nextMonthStart.getTime() - 1),
  };
}
