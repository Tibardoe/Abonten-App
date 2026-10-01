import type {
  ReportCategory,
  ReportTargetType,
} from "@abonten/types/adminTypes";
import type { CoreTranslator } from "./i18n/translator";

// The words of the "Report this …" flow on web and native. The admin
// console keeps its own English labels (@abonten/types/adminTypes).

/** "Spam", "Fraud or scam", … */
export function reportCategoryLabel(
  t: CoreTranslator,
  category: ReportCategory,
): string {
  return t(`report.category.${category}`);
}

/** "Report this event" — the whole phrase, so each language words it. */
export function reportTitle(
  t: CoreTranslator,
  target: ReportTargetType,
): string {
  return t("report.title", { target });
}

/** Shown once a report has been sent. */
export function reportThanks(t: CoreTranslator): string {
  return t("report.thanks");
}
