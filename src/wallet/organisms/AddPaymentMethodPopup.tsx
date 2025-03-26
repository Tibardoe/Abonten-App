"use client";

import Image from "next/image";
import { useState } from "react";
import PaymentOptionCard from "../molecules/PaymentOptionCard";
import AddMomoWallet from "./AddMomoWallet";

type PopupCloseProp = {
  onclick: () => void;
};

export default function AddPaymentMethodPopup({ onclick }: PopupCloseProp) {
  const [step, setStep] = useState(1);

  const increaseStep = () => {
    setStep(step + 1);
  };

  return (
    <div
      onClick={onclick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onclick;
        }
      }}
      className="fixed top-0 left-0 z-10 bg-black bg-opacity-30 w-full min-h-dvh flex justify-center items-end md:items-center"
    >
      {step === 1 && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full md:w-[60%] lg:w-[50%] bg-white rounded-t-3xl md:rounded-xl pt-5 p-3 md:p-5 space-y-5 pb-16 md:pb-20"
        >
          <div className="hidden md:flex justify-between items-center">
            <h1 className="font-bold text-lg">Add wallet</h1>

            <button type="button" onClick={onclick}>
              <Image
                src="/assets/images/circularCancel.svg"
                alt="Close"
                width={25}
                height={25}
              />
            </button>
          </div>

          <PaymentOptionCard
            imgUrl="/assets/images/phone.svg"
            optionTitle="Mobile Money"
            optionDetails="MTN, Telecel, AT Money, G-Money"
            handleStep={increaseStep}
          />

          <PaymentOptionCard
            imgUrl="/assets/images/bankCard.svg"
            optionTitle="Bank Card"
            optionDetails="Visa, Mastercard"
            handleStep={increaseStep}
          />
        </div>
      )}

      {step === 2 && <AddMomoWallet onclick={onclick} />}
    </div>
  );
}
