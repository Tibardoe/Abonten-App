"use client";

import type { PaymentMethodRow } from "@/actions/getUserPaymentMethods";
import { useState } from "react";
import { IoMdAddCircle } from "react-icons/io";
import AddPaymentMethodPopup from "./AddPaymentMethodPopup";

type AddWalletButtonProps = {
  onAdded?: (method: PaymentMethodRow) => void;
};

export default function AddWalletButton({ onAdded }: AddWalletButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handlePopupClick = () => {
    setIsOpen(true);
  };

  const handlePopupClose = () => {
    setIsOpen(false);
  };

  const handleAdded = (method: PaymentMethodRow) => {
    setIsOpen(false);
    onAdded?.(method);
  };

  return (
    <>
      <button
        type="button"
        onClick={handlePopupClick}
        className="text-[0.8rem] md:text-[1rem] flex flex-col gap-2 items-center justify-center w-44 h-44 md:w-52 md:h-52 rounded-2xl border border-border bg-muted"
      >
        <IoMdAddCircle className="text-primary text-3xl md:text-4xl" />
        <p className="text-muted-foreground">
          Add a new mobile money wallet or a bank card
        </p>
      </button>

      {isOpen && (
        <AddPaymentMethodPopup
          onclick={handlePopupClose}
          onAdded={handleAdded}
        />
      )}
    </>
  );
}
