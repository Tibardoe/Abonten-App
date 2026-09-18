import type { FinalizeResult } from "./finalizePaystackPayment";

// What HTTP status the Paystack `charge.success` webhook answers with once
// finalizePaystackPayment has run.
//
// Paystack redelivers a webhook on any non-2xx (with back-off, for hours),
// and stops the moment it sees a 2xx. So the status is a promise: 200 means
// "this delivery has been fully dealt with, never send it again". That
// promise must only be made for an outcome that is genuinely settled.
//
// The handler used to answer 200 for every outcome once the signature had
// checked out, on the reasoning that the finalize function's own lock made
// retries safe. Retries being safe is not the same as retries happening: a
// transient failure inside finalize (Paystack's verify endpoint timing out,
// a database hiccup between the lock and the ticket issuance) put the
// attempt back into a retryable state and then told Paystack it was done —
// so nothing ever retried it. The customer had paid, no ticket existed, and
// the only way out was the person noticing and tapping "Check again".
//
// Settled outcomes (200):
//   • succeeded — fulfilled.
//   • failed    — Paystack itself reported a decline/abandon, or the amount
//                 or reference did not match. Terminal by design; a retry
//                 would re-verify and fail the same way.
//   • not_found — no such attempt. Nothing a redelivery could change.
//
// Unsettled outcomes (503, so Paystack tries again):
//   • pending            — verify could not be reached, or Paystack still
//                          reports the charge as pending. The attempt is back
//                          in a state the lock accepts.
//   • fulfillment_failed — money confirmed, issuance failed (a transient
//                          Cloudinary/email/DB error is the usual cause).
//                          The retry re-enters through the same lock and only
//                          redoes the members that failed.
//   • already_processing — another caller (the client's verify, an earlier
//                          delivery) holds the lock right now. Asking Paystack
//                          to come back later costs one request and turns a
//                          "the other caller crashed mid-way" case — which
//                          the 15-minute stale-lock sweep releases — into one
//                          that finishes on its own instead of waiting for a
//                          human.
//
// A 503 for an outcome that stays unsettled for good (a checkout that lapsed
// before its cash landed, which finalize leaves in fulfillment_failed for
// support) means Paystack keeps knocking for a while; each visit is one
// idempotent finalize call and then stops on its own. That is cheaper than
// the alternative, which is a paid-for order nobody comes back to.
export const WEBHOOK_ACK_OK = 200;
export const WEBHOOK_ACK_RETRY = 503;

export function paystackWebhookAckStatus(
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
