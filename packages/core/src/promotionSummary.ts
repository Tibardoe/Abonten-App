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

/** "3-day package · Active" / "Promoted Spotlight · In review". */
export function promotionStatusLine(
  t: CoreTranslator,
  p: ActivePromotionSummary,
): string {
  const state = promotionStateLabel(t, p.state);
  return p.tierLabel
    ? t("promotionSummary.statusLine", { tier: p.tierLabel, state })
    : state;
}
