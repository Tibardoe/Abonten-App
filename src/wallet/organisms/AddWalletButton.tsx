"use client";

import Image from "next/image";
import { useState } from "react";
import { IoMdAddCircle } from "react-icons/io";
import AddPaymentMethodPopup from "./AddPaymentMethodPopup";

export default function AddWalletButton() {
  const [isOpen, setIsOpen] = useState(false);

  const handlePopupClick = () => {
    setIsOpen(true);
  };

  const handlePopupClose = () => {
    setIsOpen(false);
  };
  return (
    <>
      <button
        type="button"
        onClick={handlePopupClick}
        className="text-[0.8rem] md:text-[1rem] flex flex-col gap-2 items-center justify-center w-44 h-44 md:w-52 md:h-52 rounded-2xl border border-black bg-black bg-opacity-5"
      >
        <IoMdAddCircle className="text-mint text-3xl md:text-4xl" />
        <p className="opacity-60">
          Add a new mobile money wallet or a bank card
        </p>
      </button>

      {isOpen && <AddPaymentMethodPopup onclick={handlePopupClose} />}
    </>
  );
}
