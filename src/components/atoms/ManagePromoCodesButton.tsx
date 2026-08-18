"use client";

import ManagePromoCodesModal from "@/components/organisms/ManagePromoCodesModal";
import { useState } from "react";
import { MdLocalOffer } from "react-icons/md";

type ManagePromoCodesButtonProps = {
  eventId: string;
};

export default function ManagePromoCodesButton({
  eventId,
}: ManagePromoCodesButtonProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        type="button"
        className="flex items-center gap-1 p-1"
        onClick={() => setShowModal(true)}
      >
        <MdLocalOffer className="text-xl" />
        Manage Promo Codes
      </button>

      {showModal && (
        <ManagePromoCodesModal
          eventId={eventId}
          handleClosePopup={setShowModal}
        />
      )}
    </>
  );
}
