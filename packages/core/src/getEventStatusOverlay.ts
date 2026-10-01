import type { Occurrence } from "@abonten/types/occurrenceType";
import { getEventStatus } from "./eventStatus";
import type { CoreTranslator } from "./i18n/translator";

/**
 * Display-text wrapper around the shared getEventStatus computation. Kept
 * as its own function (rather than inlining getEventStatus's result at the
 * call site) so the "Ongoing"/"Event ended" words live in one place
 * (`eventStatus.*` of the core namespace). "Upcoming" and "no date info"
 * both render no overlay, matching the existing card UI which only
 * overlays ongoing/ended/sold-out/canceled.
 */
export function getEventStatusOverlay(
  t: CoreTranslator,
  starts_at: Date | string | null | undefined,
  ends_at: Date | string | null | undefined,
  event_dates?: Occurrence[] | null,
): string | null {
  const status = getEventStatus(starts_at, ends_at, event_dates);

  if (status === "ongoing") return t("eventStatus.ongoing");
  if (status === "ended") return t("eventStatus.ended");
  return null;
}
