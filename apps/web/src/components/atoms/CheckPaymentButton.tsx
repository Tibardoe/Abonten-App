"use client";

import verifyPaystackPayment from "@/actions/verifyPaystackPayment";
import { useCooldown } from "@/hooks/useCooldown";
import { useToast } from "@/hooks/useToast";
import { invalidateTicketStatusQueries } from "@/utils/mutationQueryInvalidation";
import { PENDING_CHECKOUTS_QUERY_KEY } from "@abonten/core/queryKeys";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

const CHECK_COOLDOWN_SECONDS = 10;

/**
 * "Check payment" for a held checkout whose payment is already under way
 * (approved on a phone, or the provider has not answered yet). Runs the
 * server's own verification — never a second charge — and says what it
 * found; rests a few seconds between presses.
 */
export default function CheckPaymentButton({
  attemptId,
}: {
  attemptId: string;
}) {
  const t = useTranslations("common");
  const toast = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const cooldown = useCooldown();

  const check = useMutation({
    mutationFn: () => verifyPaystackPayment(attemptId),
    onSuccess: (response) => {
      if (response.status === 200) {
        toast.success(t("paymentConfirmedTicketsReady"));
        queryClient.invalidateQueries({
          queryKey: PENDING_CHECKOUTS_QUERY_KEY,
        });
        invalidateTicketStatusQueries(queryClient);
        router.refresh();
        return;
      }
      cooldown.start(CHECK_COOLDOWN_SECONDS);
      if (response.status === 202) {
        toast.info(t("weJustCheckedNotConfirmedYet"));
        return;
      }
      if (response.status === 207) {
        toast.info(response.message);
        return;
      }
      toast.error(
        "message" in response && response.message
          ? response.message
          : t("thePaymentCouldNotBeVerified"),
      );
      // A declined or abandoned payment: the checkout can be paid again.
      if (response.status === 400) {
        queryClient.invalidateQueries({
          queryKey: PENDING_CHECKOUTS_QUERY_KEY,
        });
      }
    },
    onError: () => {
      cooldown.start(CHECK_COOLDOWN_SECONDS);
      toast.error(t("thePaymentCouldNotBeVerified"));
    },
  });

  return (
    <button
      type="button"
      disabled={check.isPending || cooldown.secondsLeft > 0}
      onClick={() => check.mutate()}
      className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
    >
      {check.isPending
        ? t("checkingPayment")
        : cooldown.secondsLeft > 0
          ? t("checkAgainIn", { seconds: cooldown.secondsLeft })
          : t("checkPayment")}
    </button>
  );
}
