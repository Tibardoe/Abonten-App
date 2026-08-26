// Shared by ticket checkout (validateCheckout.ts), Featured Places checkout
// (insertPlacePromotionCheckout.ts), and Event Promotion checkout
// (insertEventPromotionCheckout.ts) so their reservation windows can't
// silently drift apart. Not a "use server" file — this is a plain
// constant/helper, not an action.
export const CHECKOUT_RESERVATION_MINUTES = 30;

export function getCheckoutExpiryTimestamp(): Date {
  return new Date(Date.now() + CHECKOUT_RESERVATION_MINUTES * 60 * 1000);
}
