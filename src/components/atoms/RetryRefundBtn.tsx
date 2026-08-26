"use client";

import issueRefund from "@/actions/issueRefund";
import { useToast } from "@/hooks/useToast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type RetryRefundBtnProps = {
  transactionId: string;
  // The InfiniteList cache entry (["attending-events-refunds"], typically)
  // this card was rendered from — refetched on success so the refund status
  // badge updates without a manual page reload.
  queryKey: unknown[];
};

/**
 * Shown only when a refund was actually attempted and failed (transaction
 * still "successful" but refund_requested_at is set — see
 * src/utils/refundStatus.ts). Reuses issueRefund.ts unchanged: it's already
 * idempotent (re-checks transaction.status before doing anything), so
 * calling it again here is a safe, legitimate retry, never a duplicate
 * refund.
 */
export default function RetryRefundBtn({
  transactionId,
  queryKey,
}: RetryRefundBtnProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { mutate, isPending } = useMutation({
    mutationFn: () => issueRefund(transactionId),
    onSuccess: (response) => {
      if (response.status === 200) {
        toast.success(response.message ?? "Refund requested again.");
        queryClient.invalidateQueries({ queryKey });
      } else {
        toast.error(
          response.message ?? "Couldn't retry the refund. Please try again.",
        );
      }
    },
    onError: () => {
      toast.error("Couldn't retry the refund. Please try again.");
    },
  });

  return (
    <button
      type="button"
      onClick={() => mutate()}
      disabled={isPending}
      className="text-xs font-semibold text-primary hover:underline disabled:opacity-60"
    >
      {isPending ? "Retrying…" : "Retry refund"}
    </button>
  );
}
