"use client";

import retryPaymentFulfillment from "@/actions/retryPaymentFulfillment";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

type FulfillmentRecoveryBannerProps = {
  paymentAttemptId: string;
  initialMessage: string;
};

/**
 * Shown on a checkout-page revisit (not just the live PaymentMethodSelector
 * component) when a payment_attempt for this checkout is stuck in
 * "fulfillment_failed" — Paystack already charged the user successfully,
 * only issuing the purchase failed. Never implies the payment itself
 * failed, and never offers a path back into PaymentMethodSelector's normal
 * "pay" flow, which would risk a second real charge.
 */
export default function FulfillmentRecoveryBanner({
  paymentAttemptId,
  initialMessage,
}: FulfillmentRecoveryBannerProps) {
  const router = useRouter();
  const [message, setMessage] = useState(initialMessage);

  const { mutate, isPending } = useMutation({
    mutationFn: () => retryPaymentFulfillment(paymentAttemptId),
    onSuccess: (response) => {
      if (response.status === 200) {
        router.refresh();
        return;
      }
      if (response.status === 207) {
        setMessage(response.message);
        return;
      }
      setMessage(
        "message" in response && response.message
          ? response.message
          : "Still couldn't finish this. Please contact support.",
      );
    },
    onError: () =>
      setMessage("Still couldn't finish this. Please contact support."),
  });

  return (
    <div className="space-y-3 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-center">
      <p className="font-semibold">Payment successful</p>
      <p>{message}</p>
      <button
        type="button"
        disabled={isPending}
        onClick={() => mutate()}
        className="w-full rounded-md p-3 font-bold text-primary-foreground bg-primary text-center disabled:opacity-50"
      >
        {isPending ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}
