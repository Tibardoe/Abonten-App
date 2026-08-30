"use client";

import cancelEventPromotionCheckout from "@/actions/cancelEventPromotionCheckout";
import cancelPlacePromotionCheckout from "@/actions/cancelPlacePromotionCheckout";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useToast } from "@/hooks/useToast";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MdDeleteOutline } from "react-icons/md";

type CancelPendingCheckoutButtonProps = {
  checkoutId: string;
  kind: "event-promotion" | "promotion";
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
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      kind === "event-promotion"
        ? cancelEventPromotionCheckout(checkoutId)
        : cancelPlacePromotionCheckout(checkoutId),

    onSuccess: (response) => {
      setShowConfirm(false);
      if (response.status === 200) {
        toast.success("Order cancelled.");
        router.refresh();
      } else {
        toast.error(
          response.message ?? "Couldn't cancel this order. Please try again.",
        );
      }
    },

    onError: () => {
      setShowConfirm(false);
      toast.error("Couldn't cancel this order. Please try again.");
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
        Cancel this order
      </button>

      {showConfirm && (
        <ConfirmDeleteModal
          title="Cancel this order?"
          message="Are you sure you want to cancel this pending order? This can't be undone."
          confirmLabel="Cancel Order"
          cancelLabel="Keep Order"
          loadingLabel="Cancelling…"
          isLoading={isPending}
          onConfirm={() => mutate()}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
