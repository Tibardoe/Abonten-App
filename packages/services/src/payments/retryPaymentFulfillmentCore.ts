import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizePaystackPayment } from "./finalizePaystackPayment";
import type { PaymentFulfillmentDeps } from "./fulfillmentDeps";

// Post-auth body of retryPaymentFulfillment — shared with
// `/api/mobile/payments/retry`. Caller supplies an already-authenticated
// client + the resolved userId; the ownership check on the payment_attempt
// is kept here. Never re-charges: re-invokes the exact same
// finalizePaystackPayment pipeline the webhook and initial verify use,
// which re-verifies with Paystack (a read) and reuses the already-recorded
// `transaction` row. Deliberately NOT a "use server" file (see
// verifyPaystackPaymentCore.ts).

export type RetryPaymentFulfillmentCoreResult =
  | { status: 403 | 404; message: string }
  | { status: 200; data: { finalized: "succeeded" } }
  | {
      status: 202;
      data: { finalized: "pending" | "already_processing" };
      message?: string;
    }
  | {
      status: 207;
      data: { finalized: "fulfillment_failed"; paymentAttemptId: string };
      message: string;
    }
  | { status: 400; data: { finalized: "failed" }; message: string };

export async function retryPaymentFulfillmentCore(
  supabase: SupabaseClient,
  userId: string,
  paymentAttemptId: string,
  deps: PaymentFulfillmentDeps,
): Promise<RetryPaymentFulfillmentCoreResult> {
  const { data: attempt, error: attemptError } = await supabase
    .from("payment_attempt")
    .select("id, user_id")
    .eq("id", paymentAttemptId)
    .maybeSingle();

  if (attemptError) {
    logger.error(`Failed fetching payment attempt: ${attemptError.message}`);
    return { status: 404, message: "Payment attempt not found" };
  }

  if (!attempt) {
    return { status: 404, message: "Payment attempt not found" };
  }

  if (attempt.user_id !== userId) {
    return { status: 403, message: "Not authorized" };
  }

  const result = await finalizePaystackPayment(
    supabase,
    paymentAttemptId,
    deps,
  );

  if (result.status === "succeeded") {
    return { status: 200, data: { finalized: "succeeded" } };
  }

  if (result.status === "pending" || result.status === "already_processing") {
    return {
      status: 202,
      data: { finalized: result.status },
      message: "message" in result ? result.message : undefined,
    };
  }

  if (result.status === "not_found") {
    return { status: 404, message: "Payment attempt not found" };
  }

  if (result.status === "fulfillment_failed") {
    return {
      status: 207,
      data: {
        finalized: "fulfillment_failed",
        paymentAttemptId: result.paymentAttemptId,
      },
      message: result.message,
    };
  }

  return {
    status: 400,
    data: { finalized: "failed" },
    message: result.message,
  };
}
