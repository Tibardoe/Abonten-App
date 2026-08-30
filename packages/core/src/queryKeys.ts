// Query keys shared across files that would otherwise need to import one
// another (see PENDING_CHECKOUTS_QUERY_KEY's use in both
// PendingCheckoutsBasket.tsx and PaymentMethodSelector.tsx) — kept here
// instead to avoid a circular import between them.
export const PENDING_CHECKOUTS_QUERY_KEY = ["pending-checkouts"];
