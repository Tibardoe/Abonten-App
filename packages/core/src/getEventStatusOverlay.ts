import type { Occurrence } from "@abonten/types/occurrenceType";
import { getEventStatus } from "./eventStatus";

/**
 * Display-text wrapper around the shared getEventStatus computation. Kept
 * as its own function (rather than inlining getEventStatus's result at the
 * call site) so the "Ongoing"/"Event Ended" strings live in one place.
 * "Upcoming" and "no date info" both render no overlay, matching the
 * existing card UI which only overlays ongoing/ended/sold-out/canceled.
 */
export function getEventStatusOverlay(
  starts_at: Date | string | null | undefined,
  ends_at: Date | string | null | undefined,
  event_dates?: Occurrence[] | null,
): string | null {
  const status = getEventStatus(starts_at, ends_at, event_dates);

  if (status === "ongoing") return "Ongoing";
  if (status === "ended") return "Event Ended";
  return null;
}
