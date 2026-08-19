"use client";

import MaskIcon from "@/components/atoms/MaskIcon";
import type { PayoutAccountRow } from "@/types/organizerFinance";
import PaymentOptionCard from "@/wallet/molecules/PaymentOptionCard";
import { useState } from "react";
import AddBankPayoutForm from "../molecules/AddBankPayoutForm";
import AddMobileMoneyPayoutForm from "../molecules/AddMobileMoneyPayoutForm";

type PopupCloseProp = {
  onclick: () => void;
  onAdded: (account: PayoutAccountRow) => void;
};

// Mirrors AddPaymentMethodPopup.tsx's exact two-step shell (choose type,
// then fill the matching form) — same modal chrome, applied to organizer
// payout destinations instead of buyer payment methods.
export default function AddPayoutAccountPopup({
  onclick,
  onAdded,
}: PopupCloseProp) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");

  const increaseStep = (title: string) => {
    setTitle(title);
    setStep((prevState) => prevState + 1);
  };

  return (
    <div
      onClick={onclick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onclick();
        }
      }}
      className="fixed top-0 left-0 z-30 bg-overlay/30 w-full min-h-dvh flex justify-center items-end md:items-center"
    >
      {step === 1 && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: <explanation>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full md:w-[60%] lg:w-[50%] bg-card text-card-foreground rounded-t-3xl md:rounded-xl pt-5 p-3 md:p-5 space-y-5 pb-16 md:pb-20"
        >
          <div className="hidden md:flex justify-between items-center">
            <h1 className="font-bold text-lg">Add payout account</h1>

            <button type="button" onClick={onclick}>
              <MaskIcon
                src="/assets/images/circularCancel.svg"
                alt="Close"
                className="w-[25px] h-[25px] bg-foreground"
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
            optionTitle="Bank Account"
            optionDetails="Receive earnings directly into your bank"
            handleStep={increaseStep}
          />
        </div>
      )}

      {step === 2 && title === "Mobile Money" && (
        <AddMobileMoneyPayoutForm onclick={onclick} onSaved={onAdded} />
      )}
      {step === 2 && title === "Bank Account" && (
        <AddBankPayoutForm onclick={onclick} onSaved={onAdded} />
      )}
    </div>
  );
}
