"use client";

import issueRefund from "@/actions/issueRefund";
import { useToast } from "@/hooks/useToast";
import { invalidateOrganizerFinanceQueries } from "@/utils/mutationQueryInvalidation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

type RetryRefundBtnProps = {
  transactionId: string;
  // The InfiniteList cache entry (["attending-events-refunds"], typically)
  // this card was rendered from — refetched on success so the refund status
  // badge updates without a manual page reload.
  queryKey: unknown[];
  /** The refund was never asked for (a ticket cancelled before tickets
   *  were refunded one by one): "Request refund", not "Retry". */
  neverRequested?: boolean;
};

/**
 * Shown when a cancelled ticket's refund failed, or was never asked for
 * (@abonten/core/refundStatus). Reuses issueRefund.ts unchanged: it refunds
 * only cancelled tickets no live refund covers yet, so calling it again is
 * a safe, legitimate retry, never a duplicate refund.
 */
export default function RetryRefundBtn({
  transactionId,
  queryKey,
  neverRequested = false,
}: RetryRefundBtnProps) {
  const t = useTranslations("common");

  const queryClient = useQueryClient();
  const toast = useToast();

  const { mutate, isPending } = useMutation({
    mutationFn: () => issueRefund(transactionId),
    onSuccess: (response) => {
      if (response.status === 200) {
        toast.success(response.message ?? t("refundRequestedAgain"));
        queryClient.invalidateQueries({ queryKey });
        // Changes the organizer's own ledger balance -- refresh their
        // Finances screens too.
        invalidateOrganizerFinanceQueries(queryClient);
      } else {
        toast.error(response.message ?? t("couldnTRetryTheRefundPlease"));
      }
    },
    onError: () => {
      toast.error(t("couldnTRetryTheRefundPlease"));
    },
  });

  return (
    <button
      type="button"
      onClick={() => mutate()}
      disabled={isPending}
      className="text-xs font-semibold text-primary hover:underline disabled:opacity-60"
    >
      {isPending
        ? t("retrying")
        : neverRequested
          ? t("requestRefund")
          : t("retryRefund")}
    </button>
  );
}
