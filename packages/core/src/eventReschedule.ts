// Moving an event that already has tickets (docs/architecture/event-reschedule.md).
// The database (event_reschedule()) decides; these mirror its rules so the
// forms can say what is wrong before anything is sent, and show the refund
// window the holders will get.

/** The organizer's message to holders. */
export const MAX_RESCHEDULE_MESSAGE = 1000;
/** Moves per event. */
export const MAX_RESCHEDULES = 2;
/** The new start is at least this far ahead. */
export const MIN_HOURS_BEFORE_NEW_START = 2;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type RescheduleProblem =
  | "dates"
  | "too_soon"
  | "unchanged"
  | "message"
  | "too_many";

export function rescheduleProblem(input: {
  startsAt: Date | null;
  endsAt: Date | null;
  message: string;
  currentStartsAt: Date;
  currentEndsAt: Date | null;
  moves: number;
  now?: Date;
}): RescheduleProblem | null {
  const now = (input.now ?? new Date()).getTime();
  if (input.moves >= MAX_RESCHEDULES) return "too_many";
  if (
    !input.startsAt ||
    !input.endsAt ||
    Number.isNaN(input.startsAt.getTime()) ||
    Number.isNaN(input.endsAt.getTime()) ||
    input.endsAt.getTime() <= input.startsAt.getTime()
  ) {
    return "dates";
  }
  if (input.startsAt.getTime() <= now + MIN_HOURS_BEFORE_NEW_START * HOUR) {
    return "too_soon";
  }
  if (
    input.startsAt.getTime() === input.currentStartsAt.getTime() &&
    input.endsAt.getTime() === (input.currentEndsAt?.getTime() ?? Number.NaN)
  ) {
    return "unchanged";
  }
  const message = input.message.trim();
  if (message.length === 0 || message.length > MAX_RESCHEDULE_MESSAGE) {
    return "message";
  }
  return null;
}

/**
 * Until when holders may give their tickets back for a full refund: 7 days,
 * and no later than 48 hours before the new date; never less than a day
 * (nor past the new start) when the new date is close. The same rule as
 * event_reschedule() in SQL.
 */
export function rescheduleRefundUntil(
  newStartsAt: Date,
  now = new Date(),
): Date {
  const start = newStartsAt.getTime();
  const t = now.getTime();
  let until = Math.min(t + 7 * DAY, start - 48 * HOUR);
  const floor = Math.min(t + DAY, start);
  if (until < floor) until = floor;
  return new Date(until);
}

/** Whether holders may still give their tickets back after a move. */
export function rescheduleRefundOpen(
  refundUntil: string | Date,
  now = new Date(),
): boolean {
  const until = new Date(refundUntil).getTime();
  return !Number.isNaN(until) && now.getTime() <= until;
}
