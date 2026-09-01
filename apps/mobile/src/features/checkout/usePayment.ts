import { api } from "@/lib/api";
import type { CheckoutAttemptBody } from "@abonten/api-client";
import { useMutation } from "@tanstack/react-query";

export function useCreateAttempt() {
  return useMutation({
    mutationFn: (body: CheckoutAttemptBody) => api.checkout.attempt(body),
  });
}

export function useVerifyPayment() {
  return useMutation({
    mutationFn: (paymentAttemptId: string) =>
      api.payments.verify(paymentAttemptId),
  });
}

// Recovery for a 207 (paid, but ticket issuance failed). Never re-charges.
export function useRetryFulfillment() {
  return useMutation({
    mutationFn: (paymentAttemptId: string) =>
      api.payments.retry(paymentAttemptId),
  });
}

export function useSubmitChargeOtp() {
  return useMutation({
    mutationFn: (v: { paymentAttemptId: string; otp: string }) =>
      api.payments.submitChargeOtp(v.paymentAttemptId, v.otp),
  });
}
