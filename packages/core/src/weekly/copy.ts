// Fixed product words for Abonten Weekly, shared by web, mobile and the admin
// console. Edition titles, subtitles and section copy are editable per
// edition; these are the strings around them.

import type {
  WeeklyEditionStatus,
  WeeklyValidationIssue,
  WeeklyValidityReason,
} from "@abonten/types/weeklyType";

export const WEEKLY_PRODUCT_NAME = "Abonten Weekly";

export const WEEKLY_TAGLINE =
  "The events, places and experiences worth discovering this week.";

export const WEEKLY_NATIONAL_SCOPE_SLUG = "ghana";

export const WEEKLY_DEFAULT_TITLE = "This week on Abonten";

export const WEEKLY_EDITION_STATUS_LABEL: Record<WeeklyEditionStatus, string> =
  {
    draft: "Draft",
    scheduled: "Scheduled",
    published: "Published",
    archived: "Archived",
  };

export const WEEKLY_VALIDITY_LABEL: Record<WeeklyValidityReason, string> = {
  missing: "Listing no longer exists",
  canceled: "Event cancelled",
  removed: "Removed by moderation",
  hidden: "Hidden by moderation",
  restricted: "Restricted by moderation",
  archived: "Archived",
  ended: "Event has ended",
  not_published: "Not published",
  permanently_closed: "Permanently closed",
  unsupported: "Not supported yet",
};

export const WEEKLY_ISSUE_LABEL: Record<WeeklyValidationIssue["code"], string> =
  {
    scope_retired: "This edition's area has been retired.",
    week_over: "This week has already ended.",
    no_valid_items: "Add at least one listing that can be shown.",
    invalid_items: "Some listings will not be shown.",
    duplicate_subjects: "Some listings appear in more than one section.",
    organizer_concentration:
      "One organizer has several events in the same section.",
    recently_featured: "Some listings were in recent editions for this area.",
    empty_sections: "Some sections have no listings and will be hidden.",
  };

/** Site path of an edition. */
export function weeklyEditionPath(
  scopeSlug: string,
  weekStart: string,
): string {
  return `/weekly/${encodeURIComponent(scopeSlug)}/${encodeURIComponent(weekStart)}`;
}

/** Share text used by web and mobile share sheets. */
export function weeklyShareText(title: string, scopeName: string): string {
  return `${WEEKLY_PRODUCT_NAME} · ${scopeName}: ${title}`;
}
