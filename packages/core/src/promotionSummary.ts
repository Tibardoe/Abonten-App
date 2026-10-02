import type {
  ActivePromotionState,
  ActivePromotionSummary,
} from "@abonten/types/promotionSummaryType";
import type { CoreTranslator } from "./i18n/translator";

// Wording for the Settings promotion summary, shared by web and mobile so
// both say the same thing about the same promotion. Words live under
// `promotionSummary.*` of the core namespace.

export function promotionKindLabel(
  t: CoreTranslator,
  kind: ActivePromotionSummary["resourceType"],
): string {
  return t(`promotionSummary.kind.${kind}`);
}

export function promotionStateLabel(
  t: CoreTranslator,
  state: ActivePromotionState,
): string {
  return t(`promotionSummary.state.${state}`);
}

const DURATION_UNITS: Record<string, string> = {
  hour: "hours",
  hours: "hours",
  day: "days",
  days: "days",
  week: "weeks",
  weeks: "weeks",
  month: "months",
  months: "months",
};

/**
 * A promotion package's length in the reader's language. Tiers store their
 * length as an English label ("24 hours", "3 days", "1 month" — data in
 * `*_promotion_tier.duration_label`); a label of that shape is re-worded,
 * anything else is shown as it is.
 */
export function promotionDurationLabel(
  t: CoreTranslator,
  label: string | null | undefined,
): string {
  const text = (label ?? "").trim();
  const m = text.match(/^(\d+)[\s-]+([a-z]+)$/i);
  const unit = m ? DURATION_UNITS[m[2].toLowerCase()] : undefined;
  if (!m || !unit) return text;
  return t(`promotionSummary.duration.${unit}`, { count: Number(m[1]) });
}

/** "3-day package · Active" / "Promoted Spotlight · In review". */
export function promotionStatusLine(
  t: CoreTranslator,
  p: ActivePromotionSummary,
): string {
  const state = promotionStateLabel(t, p.state);
  return p.tierLabel
    ? t("promotionSummary.statusLine", {
        tier: promotionDurationLabel(t, p.tierLabel),
        state,
      })
    : state;
}
