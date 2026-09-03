import { api } from "@/lib/api";
import type { CheckoutAttemptBody } from "@abonten/api-client";
import { useMutation } from "@tanstack/react-query";

// Starting a checkout payment attempt. Verification (verify / retry /
// charge-otp) lives in usePaymentVerification.ts, which drives the dedicated
// <PaymentVerificationScreen>.
export function useCreateAttempt() {
  return useMutation({
    mutationFn: (body: CheckoutAttemptBody) => api.checkout.attempt(body),
  });
}
