// Fixed product words for Abonten Weekly, shared by web, mobile and the admin
// console. Edition titles, subtitles and section copy are editable per
// edition; these are the strings around them, under `weekly.*` of the core
// namespace in packages/i18n.

import type {
  WeeklyEditionStatus,
  WeeklyValidationIssue,
  WeeklyValidityReason,
} from "@abonten/types/weeklyType";
import type { CoreTranslator } from "../i18n/translator";

export const WEEKLY_PRODUCT_NAME = "Abonten Weekly";

export const WEEKLY_TAGLINE_KEY = "weekly.tagline";

export const WEEKLY_NATIONAL_SCOPE_SLUG = "ghana";

export const WEEKLY_DEFAULT_TITLE_KEY = "weekly.defaultTitle";

export function weeklyEditionStatusLabel(
  t: CoreTranslator,
  status: WeeklyEditionStatus,
): string {
  return t(`weekly.editionStatus.${status}`);
}

export function weeklyValidityLabel(
  t: CoreTranslator,
  reason: WeeklyValidityReason,
): string {
  return t(`weekly.validity.${reason}`);
}

export function weeklyIssueLabel(
  t: CoreTranslator,
  code: WeeklyValidationIssue["code"],
): string {
  return t(`weekly.issue.${code}`);
}

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
