// Shared by both ticket checkout (validateCheckout.ts) and subscription
// checkout (insertSubscriptionCheckout.ts) so the two reservation windows
// can't silently drift apart. Not a "use server" file — this is a plain
// constant/helper, not an action.
export const CHECKOUT_RESERVATION_MINUTES = 30;

export function getCheckoutExpiryTimestamp(): Date {
  return new Date(Date.now() + CHECKOUT_RESERVATION_MINUTES * 60 * 1000);
}
