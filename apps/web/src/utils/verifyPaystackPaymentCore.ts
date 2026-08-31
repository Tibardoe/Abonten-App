import { finalizePaystackPayment } from "@/utils/finalizePaystackPayment";
import { logger } from "@abonten/core/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

// Post-auth body of verifyPaystackPayment — shared with
// `/api/mobile/payments/verify`. Caller supplies an already-authenticated
// client + the resolved userId; the ownership check on the payment_attempt
// is kept here. Same finalizePaystackPayment() the webhook calls, so
// whichever of the two wins the race does the real work.

export type VerifyPaystackPaymentCoreResult =
  | { status: 403 | 404; message: string }
  | { status: 200; data: { finalized: "succeeded" } }
  | {
      status: 202;
      data: { finalized: "pending" | "already_processing" };
      message?: string;
    }
  | { status: 400; data: { finalized: "failed" }; message: string }
  | {
      status: 207;
      data: { finalized: "fulfillment_failed"; paymentAttemptId: string };
      message: string;
    };

export async function verifyPaystackPaymentCore(
  supabase: SupabaseClient,
  userId: string,
  paymentAttemptId: string,
): Promise<VerifyPaystackPaymentCoreResult> {
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

  // Ownership check — a user can only ever trigger verification of their
  // own payment attempt, never someone else's by guessing an id.
  if (attempt.user_id !== userId) {
    return { status: 403, message: "Not authorized" };
  }

  const result = await finalizePaystackPayment(supabase, paymentAttemptId);

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
