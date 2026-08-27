"use client";

import type { PaymentMethodRow } from "@/actions/getUserPaymentMethods";
import { BottomSheet } from "@/components/atoms/BottomSheet";
import { useState } from "react";
import PaymentOptionCard from "../molecules/PaymentOptionCard";
import AddBankCard from "./AddBankCard";
import AddMomoWallet from "./AddMomoWallet";

type PopupCloseProp = {
  onclick: () => void;
  onAdded: (method: PaymentMethodRow) => void;
};

const STEP_TITLES: Record<string, string> = {
  "Mobile Money": "Add Mobile Money Wallet",
  "Bank Card": "Add Bank Card",
};

export default function AddPaymentMethodPopup({
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
    <BottomSheet
      open
      onClose={onclick}
      title={
        step === 1
          ? "Add a payment method"
          : (STEP_TITLES[title] ?? "Add wallet")
      }
      className="md:w-[30rem]"
    >
      {step === 1 && (
        <div className="space-y-3">
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

      {step === 2 && title === "Mobile Money" && (
        <AddMomoWallet onSaved={onAdded} />
      )}
      {step === 2 && title === "Bank Card" && <AddBankCard onSaved={onAdded} />}
    </BottomSheet>
  );
}
