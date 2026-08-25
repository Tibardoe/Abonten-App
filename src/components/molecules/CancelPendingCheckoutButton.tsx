"use client";

import cancelEventPromotionCheckout from "@/actions/cancelEventPromotionCheckout";
import cancelPlacePromotionCheckout from "@/actions/cancelPlacePromotionCheckout";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useTimedMessage } from "@/hooks/useTimedMessage";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MdDeleteOutline } from "react-icons/md";
import Notification from "../atoms/Notification";

type CancelPendingCheckoutButtonProps = {
  checkoutId: string;
  kind: "event-promotion" | "promotion";
};

/**
 * Cancels a pending, not-yet-paid promotion checkout (event or place
 * feature purchase) — the promotion-checkout equivalent of
 * DeleteEventButton.tsx's confirm-then-delete shape, reusing the same
 * ConfirmDeleteModal/useTimedMessage pattern rather than inventing a new
 * confirmation UX. Distinct from cancelling an already-active promotion or
 * requesting a refund — this only ever applies while status is "pending".
 */
export default function CancelPendingCheckoutButton({
  checkoutId,
  kind,
}: CancelPendingCheckoutButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();
  const { message: notification, showMessage } = useTimedMessage(3000);

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      kind === "event-promotion"
        ? cancelEventPromotionCheckout(checkoutId)
        : cancelPlacePromotionCheckout(checkoutId),

    onSuccess: (response) => {
      setShowConfirm(false);
      if (response.status === 200) {
        router.refresh();
      } else {
        showMessage(response.message ?? "Couldn't cancel this order.");
      }
    },

    onError: () => {
      setShowConfirm(false);
      showMessage("Something went wrong. Please try again.");
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
          message="Are you sure you want to cancel this pending order? This can't be undone."
          isLoading={isPending}
          onConfirm={() => mutate()}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {notification && <Notification notification={notification} />}
    </>
  );
}
