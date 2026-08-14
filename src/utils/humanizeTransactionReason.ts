export function humanizeTransactionReason(reason: string | null | undefined) {
  if (!reason) return "";
  return reason.replace(/_/g, " ");
}
