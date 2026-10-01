"use client";

import cancelEventPromotionCheckout from "@/actions/cancelEventPromotionCheckout";
import cancelPlacePromotionCheckout from "@/actions/cancelPlacePromotionCheckout";
import { cancelContentCampaignCheckout } from "@/actions/content/cancelContentCampaignCheckout";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useToast } from "@/hooks/useToast";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MdDeleteOutline } from "react-icons/md";

type CancelPendingCheckoutButtonProps = {
  checkoutId: string;
  kind: "event-promotion" | "promotion" | "spotlight-promotion";
};

/**
 * Cancels a pending, not-yet-paid promotion checkout (event or place
 * feature purchase) — the promotion-checkout equivalent of
 * DeleteEventButton.tsx's confirm-then-delete shape, reusing the same
 * ConfirmDeleteModal/useToast pattern rather than inventing a new
 * confirmation UX. Distinct from cancelling an already-active promotion or
 * requesting a refund — this only ever applies while status is "pending".
 */
export default function CancelPendingCheckoutButton({
  checkoutId,
  kind,
}: CancelPendingCheckoutButtonProps) {
  const t = useTranslations("common");

  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      kind === "event-promotion"
        ? cancelEventPromotionCheckout(checkoutId)
        : kind === "spotlight-promotion"
          ? cancelContentCampaignCheckout(checkoutId)
          : cancelPlacePromotionCheckout(checkoutId),

    onSuccess: (response) => {
      setShowConfirm(false);
      if (response.status === 200) {
        toast.success(t("orderCancelled"));
        router.refresh();
      } else {
        toast.error(response.message ?? t("couldnTCancelThisOrderPlease"));
      }
    },

    onError: () => {
      setShowConfirm(false);
      toast.error(t("couldnTCancelThisOrderPlease"));
    },
  });

  return (
    <>
      <button
        type="button"
        className="flex items-center justify-center gap-1 text-sm text-destructive hover:underline"
        onClick={() => setShowConfirm(true)}
      >
        <MdDeleteOutline className="text-lg" />
        {t("cancelThisOrder")}
      </button>

      {showConfirm && (
        <ConfirmDeleteModal
          title={t("cancelThisOrder2")}
          message={t("areYouSureYouWantTo3")}
          confirmLabel={t("cancelOrder")}
          cancelLabel={t("keepOrder")}
          loadingLabel={t("cancelling")}
          isLoading={isPending}
          onConfirm={() => mutate()}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
