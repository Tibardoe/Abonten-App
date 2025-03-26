"use client";

import Image from "next/image";
import { useState } from "react";
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
        <Image
          src="/assets/images/add.svg"
          alt="Add icon"
          width={40}
          height={40}
          className="w-7 h-7 md:w-10 md:h-10"
        />
        Add a new mobile money wallet or a bank card
      </button>

      {isOpen && <AddPaymentMethodPopup onclick={handlePopupClose} />}
    </>
  );
}
