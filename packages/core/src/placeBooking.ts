// A booking request nobody answered before the date arrived.
//
// place_booking.status only ever holds pending / accepted / declined /
// cancelled, and nothing moves a row out of `pending` except the owner
// answering it. So a request for last Tuesday that the owner never opened is
// still `pending` today, and every surface treated it as live:
//
//   • the customer saw a "Pending" badge and a "Cancel booking" button for a
//     date that had already gone, with no way to tell whether to turn up;
//   • the owner's Bookings tab listed it under Pending with Accept and
//     Decline, and accepting it sent the customer "Booking accepted" for a
//     date in the past.
//
// The honest reading is that the request lapsed. That is derived from the
// row rather than written into it: it needs no new status value, no job to
// sweep the table, and it never rewrites what actually happened — an
// unanswered request stays unanswered in the record.
//
// Only `pending` lapses. An accepted booking whose date has passed is not
// lapsed; it simply happened, and both sides should still see it as accepted.

export type PlaceBookingStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled";

/**
 * True when a booking request was never answered and its time has passed.
 * `requestedTime` is the stored timestamp; an unparseable one is treated as
 * not lapsed, so bad data never hides a live request from its owner.
 */
export function isBookingLapsed(
  status: PlaceBookingStatus | string,
  requestedTime: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== "pending") return false;
  if (!requestedTime) return false;

  const when =
    requestedTime instanceof Date ? requestedTime : new Date(requestedTime);
  if (Number.isNaN(when.getTime())) return false;

  return when.getTime() < now.getTime();
}

/**
 * What to show for a booking: the stored status, or "lapsed" when the
 * request went unanswered past its date. Keeps the label, the badge tone and
 * the available actions derived from one decision on every surface.
 */
export function resolveBookingState(
  status: PlaceBookingStatus | string,
  requestedTime: string | Date | null | undefined,
  now: Date = new Date(),
): PlaceBookingStatus | "lapsed" {
  if (isBookingLapsed(status, requestedTime, now)) return "lapsed";
  return status as PlaceBookingStatus;
}
