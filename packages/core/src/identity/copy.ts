// The public words for an identity check, in one place so the website, the
// app and the console say the same thing. They live under `identity.*` of
// the core namespace in packages/i18n.
//
// WORDING RULE (docs/LEGAL_REVIEW_REQUIRED.md §K3), binding on every
// language: the badge may only say that Abonten checked the person's
// government ID and a live selfie. It must never imply that Abonten vouches
// for the person, their events, places, prices or safety, and it never
// shows anything from the document.

import type { CoreTranslator } from "../i18n/translator";

/** The badge's own short label ("ID checked"). */
export function identityBadgeLabel(t: CoreTranslator): string {
  return t("identity.badgeLabel");
}

/**
 * What the badge means, for its popover or sheet. On a team it means at
 * least one of its Owners was checked (legal item N9 extends K3); never
 * which one.
 */
export function identityBadgeExplanation(
  t: CoreTranslator,
  team = false,
): string {
  return t(
    team ? "identity.badgeExplanationTeam" : "identity.badgeExplanation",
  );
}
