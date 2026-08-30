"use client";

import { BottomSheet } from "@/components/atoms/BottomSheet";
import type { PayoutAccountRow } from "@/types/organizerFinance";
import PaymentOptionCard from "@/wallet/molecules/PaymentOptionCard";
import { useState } from "react";
import AddBankPayoutForm from "../molecules/AddBankPayoutForm";
import AddMobileMoneyPayoutForm from "../molecules/AddMobileMoneyPayoutForm";

type PopupCloseProp = {
  onclick: () => void;
  onAdded: (account: PayoutAccountRow) => void;
};

const STEP_TITLES: Record<string, string> = {
  "Mobile Money": "Add Mobile Money Account",
  "Bank Account": "Add Bank Account",
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
    <BottomSheet
      open
      onClose={onclick}
      title={
        step === 1
          ? "Add a payout account"
          : (STEP_TITLES[title] ?? "Add payout account")
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
            optionTitle="Bank Account"
            optionDetails="Receive earnings directly into your bank"
            handleStep={increaseStep}
          />
        </div>
      )}

      {step === 2 && title === "Mobile Money" && (
        <AddMobileMoneyPayoutForm onSaved={onAdded} />
      )}
      {step === 2 && title === "Bank Account" && (
        <AddBankPayoutForm onSaved={onAdded} />
      )}
    </BottomSheet>
  );
}
