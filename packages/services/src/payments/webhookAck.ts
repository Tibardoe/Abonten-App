import type { FinalizeResult } from "./finalizePayment";

// What HTTP status a provider's payment webhook answers with once
// finalizePayment has run.
//
// Paystack and Stripe both redeliver a webhook on any non-2xx (with
// back-off, for hours/days), and stop the moment they see a 2xx. So the
// status is a promise: 200 means "this delivery has been fully dealt with,
// never send it again". That promise must only be made for an outcome that
// is genuinely settled.
//
// The handler used to answer 200 for every outcome once the signature had
// checked out, on the reasoning that the finalize function's own lock made
// retries safe. Retries being safe is not the same as retries happening: a
// transient failure inside finalize (the provider's verify endpoint timing
// out, a database hiccup between the lock and the ticket issuance) put the
// attempt back into a retryable state and then told the provider it was
// done — so nothing ever retried it. The customer had paid, no ticket
// existed, and the only way out was the person noticing and tapping "Check
// again".
//
// Settled outcomes (200):
//   • succeeded — fulfilled.
//   • failed    — the provider itself reported a decline/abandon, or the
//                 amount or reference did not match. Terminal by design.
//   • not_found — no such attempt. Nothing a redelivery could change.
//
// Unsettled outcomes (503, so the provider tries again):
//   • pending            — verify could not be reached, or the provider still
//                          reports the charge as pending.
//   • fulfillment_failed — money confirmed, issuance failed (a transient
//                          Cloudinary/email/DB error is the usual cause).
//   • already_processing — another caller holds the lock right now.
export const WEBHOOK_ACK_OK = 200;
export const WEBHOOK_ACK_RETRY = 503;

export function webhookAckStatus(
  result: FinalizeResult,
): typeof WEBHOOK_ACK_OK | typeof WEBHOOK_ACK_RETRY {
  switch (result.status) {
    case "succeeded":
    case "failed":
    case "not_found":
      return WEBHOOK_ACK_OK;
    case "pending":
    case "fulfillment_failed":
    case "already_processing":
      return WEBHOOK_ACK_RETRY;
  }
}
