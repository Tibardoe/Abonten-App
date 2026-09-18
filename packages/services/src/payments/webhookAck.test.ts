import { describe, expect, it } from "vitest";
import type { FinalizeResult } from "./finalizePaystackPayment";
import {
  WEBHOOK_ACK_OK,
  WEBHOOK_ACK_RETRY,
  paystackWebhookAckStatus,
} from "./webhookAck";

describe("paystackWebhookAckStatus", () => {
  const settled: FinalizeResult[] = [
    { status: "succeeded" },
    { status: "failed", message: "Your payment was declined." },
    { status: "not_found" },
  ];

  const unsettled: FinalizeResult[] = [
    { status: "pending", message: "Could not verify payment right now." },
    {
      status: "fulfillment_failed",
      message: "Payment succeeded, ticket issuance failed",
      paymentAttemptId: "pa_1",
    },
    { status: "already_processing" },
  ];

  it("acknowledges a settled outcome so Paystack stops redelivering", () => {
    for (const r of settled) {
      expect(paystackWebhookAckStatus(r)).toBe(WEBHOOK_ACK_OK);
    }
  });

  it("refuses to acknowledge an outcome a retry could still change", () => {
    for (const r of unsettled) {
      expect(paystackWebhookAckStatus(r)).toBe(WEBHOOK_ACK_RETRY);
    }
  });

  it("never answers 2xx for a paid order without a fulfilled purchase", () => {
    // The regression this guards: a transient verify failure returned 200,
    // Paystack stopped, and the paid-for ticket was never issued.
    const paidButNotIssued = paystackWebhookAckStatus({
      status: "pending",
      message: "Could not verify payment right now. Please try again.",
    });
    expect(paidButNotIssued).toBeGreaterThanOrEqual(500);
  });
});
