import type { CoreTranslator } from "./i18n/translator";

// Mirrors PaymentMethodSelectorProps["kind"] in PaymentMethodSelector.tsx —
// kept as a separate alias here (rather than importing the props type) since
// this file has no other reason to depend on that component.
export type CheckoutKind =
  | "ticket"
  | "promotion"
  | "event-promotion"
  | "spotlight-promotion";

// Shown once Paystack verification has succeeded and the server is issuing
// the purchased thing (ticket / promotion) — the moment right before the
// page's own server-rendered "purchase complete" state takes over. Never say
// "ticket" for a purchase that isn't one. Words live under `fulfillment.*`
// of the core namespace.
export function getFulfillmentMessage(
  t: CoreTranslator,
  kind: CheckoutKind,
): string {
  switch (kind) {
    case "ticket":
      return t("fulfillment.ticket");
    case "spotlight-promotion":
      return t("fulfillment.spotlightPromotion");
    default:
      return t("fulfillment.promotion");
  }
}
