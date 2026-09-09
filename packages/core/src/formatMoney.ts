// Money is stored as numeric(10,2) and charged in whole pesewas, so every
// surface that shows an amount should show two decimals. Screens that built
// the string by interpolating the raw number instead ("GHS 30", "GHS 25.2",
// and — before computeCheckoutFee started rounding — "GHS 1.2000000000000002")
// disagreed with the ones that formatted it, most visibly between the Buy
// Tickets summary and the Checkout screen it leads straight into.

/** `formatMoney("GHS", 25.2)` -> `"GHS 25.20"`. */
export function formatMoney(currency: string, amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${currency} ${safe.toFixed(2)}`;
}
