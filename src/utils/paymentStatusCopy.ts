// Mirrors PaymentMethodSelectorProps["kind"] in PaymentMethodSelector.tsx —
// kept as a separate alias here (rather than importing the props type) since
// this file has no other reason to depend on that component.
export type CheckoutKind = "ticket" | "promotion" | "event-promotion";

// Shown once Paystack verification has succeeded and the server is issuing
// the purchased thing (ticket / promotion) — the moment right before the
// page's own server-rendered "purchase complete" state takes over. Never say
// "ticket" for a purchase that isn't one.
const FULFILLMENT_MESSAGE: Record<CheckoutKind, string> = {
  ticket: "Payment successful. Preparing your tickets…",
  promotion: "Payment successful. Activating your promotion…",
  "event-promotion": "Payment successful. Activating your promotion…",
};

export function getFulfillmentMessage(kind: CheckoutKind): string {
  return FULFILLMENT_MESSAGE[kind];
}
