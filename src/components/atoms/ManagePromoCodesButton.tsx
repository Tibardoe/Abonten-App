"use client";

import ManagePromoCodesModal from "@/components/organisms/ManagePromoCodesModal";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { MdLocalOffer } from "react-icons/md";

type ManagePromoCodesButtonProps = {
  eventId: string;
  /** Renders as a DropdownMenuItem (event card menu) instead of a plain button. */
  asMenuItem?: boolean;
  /** Closes the parent dropdown once this modal is dismissed -- required
   * when asMenuItem, since the modal it opens must outlive the dropdown
   * closing (see EventCardMenuBtn.tsx). */
  onRequestClose?: () => void;
};

export default function ManagePromoCodesButton({
  eventId,
  asMenuItem,
  onRequestClose,
}: ManagePromoCodesButtonProps) {
  const [showModal, setShowModal] = useState(false);

  const closeModal = () => {
    setShowModal(false);
    onRequestClose?.();
  };

  return (
    <>
      {asMenuItem ? (
        <DropdownMenuItem
          onSelect={(event) => {
            // Keep the dropdown mounted -- otherwise Radix unmounts this
            // component (and the `showModal` state below) before the modal
            // ever renders.
            event.preventDefault();
            setShowModal(true);
          }}
          className="gap-2"
        >
          <MdLocalOffer className="text-xl" />
          Manage Promo Codes
        </DropdownMenuItem>
      ) : (
        <button
          type="button"
          className="flex items-center gap-1 p-1"
          onClick={() => setShowModal(true)}
        >
          <MdLocalOffer className="text-xl" />
          Manage Promo Codes
        </button>
      )}

      {showModal && (
        <ManagePromoCodesModal
          eventId={eventId}
          handleClosePopup={() => closeModal()}
        />
      )}
    </>
  );
}
