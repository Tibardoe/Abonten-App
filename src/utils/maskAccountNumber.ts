// Shared masking for payout destinations shown anywhere in Finances —
// never render a full account/phone number in the UI.
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.trim();
  if (digits.length <= 4) return "•".repeat(digits.length);

  const lastFour = digits.slice(-4);
  if (digits.length <= 7) {
    return `${"•".repeat(digits.length - 4)} ${lastFour}`;
  }

  // Phone-number style: keep the first 3 digits visible (e.g. network
  // prefix "024"), mask the middle, reveal the last 2 — matches the task's
  // "024 *** **45" example. Anything longer/shorter than a typical Ghana
  // phone number falls back to the generic "•••• 1234" bank-style mask.
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} *** **${digits.slice(-2)}`;
  }

  return `•••• ${lastFour}`;
}
