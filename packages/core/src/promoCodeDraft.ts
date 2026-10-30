import type { CoreTranslator } from "./i18n/translator";

// What a promo code form still needs before its Add button works, in the
// order the fields are shown. The website and the app both name the first
// gap under the button: a greyed-out Add with nothing said was where pilot
// organizers got stuck (the expiry date is required, and nothing told them).

export const PROMO_CODE_MAX_LENGTH = 40;

export type PromoCodeDraft = {
  code: string;
  /** As typed: a whole percent from 1 to 100. */
  discount: string;
  /** As typed: blank means no limit, unless `maxUsesRequired`. */
  maxUses: string;
  /** The last day the code works; empty when none is picked yet. */
  expiry: string | Date | null | undefined;
};

export type PromoCodeDraftGap =
  | "code"
  | "discount"
  | "maxUses"
  | "maxUsesRequired"
  | "expiry";

const wholeNumber = (value: string) => /^\d+$/.test(value.trim());

export function promoCodeDraftGap(
  draft: PromoCodeDraft,
  options: { maxUsesRequired?: boolean } = {},
): PromoCodeDraftGap | null {
  const code = draft.code.trim();
  if (code.length === 0 || code.length > PROMO_CODE_MAX_LENGTH) return "code";

  const discount = Number(draft.discount);
  if (!wholeNumber(draft.discount) || discount < 1 || discount > 100) {
    return "discount";
  }

  const maxUses = draft.maxUses.trim();
  if (maxUses === "") {
    if (options.maxUsesRequired) return "maxUsesRequired";
  } else if (!wholeNumber(maxUses) || Number(maxUses) < 1) {
    return options.maxUsesRequired ? "maxUsesRequired" : "maxUses";
  }

  if (!draft.expiry) return "expiry";
  return null;
}

/** The sentence that names a gap, in the reader's language. */
export function promoCodeDraftGapMessage(
  t: CoreTranslator,
  gap: PromoCodeDraftGap,
): string {
  return t(`promoDraft.${gap}`, { max: PROMO_CODE_MAX_LENGTH });
}
