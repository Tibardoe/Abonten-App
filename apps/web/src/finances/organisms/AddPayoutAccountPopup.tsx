"use client";

import { BottomSheet } from "@/components/atoms/BottomSheet";
import PaymentOptionCard from "@/wallet/molecules/PaymentOptionCard";
import type { PayoutAccountRow } from "@abonten/types/organizerFinance";
import { useTranslations } from "next-intl";
import { useState } from "react";
import AddBankPayoutForm from "../molecules/AddBankPayoutForm";
import AddMobileMoneyPayoutForm from "../molecules/AddMobileMoneyPayoutForm";

type PopupCloseProp = {
  onclick: () => void;
  onAdded: (account: PayoutAccountRow) => void;
};

const STEP_TITLES: Record<string, string> = {
  "Mobile Money": "addMobileMoneyAccount",
  "Bank Account": "addBankAccount",
};

// Mirrors AddPaymentMethodPopup.tsx's exact two-step shell (choose type,
// then fill the matching form) — same modal chrome, applied to organizer
// payout destinations instead of buyer payment methods.
export default function AddPayoutAccountPopup({
  onclick,
  onAdded,
}: PopupCloseProp) {
  const t = useTranslations("finances");

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
          ? t("addAPayoutAccount")
          : STEP_TITLES[title]
            ? t(STEP_TITLES[title])
            : t("addPayoutAccount")
      }
      className="md:w-[30rem]"
    >
      {step === 1 && (
        <div className="space-y-3">
          <PaymentOptionCard
            imgUrl="/assets/images/phone.svg"
            optionTitle={t("mobileMoney")}
            optionDetails={t("mtnTelecelAtMoneyGMoney")}
            handleStep={increaseStep}
          />

          <PaymentOptionCard
            imgUrl="/assets/images/bankCard.svg"
            optionTitle={t("bankAccount")}
            optionDetails={t("receiveEarningsDirectlyIntoYourBank")}
            handleStep={increaseStep}
          />
        </div>
      )}

      {step === 2 && title === t("mobileMoney") && (
        <AddMobileMoneyPayoutForm onSaved={onAdded} />
      )}
      {step === 2 && title === t("bankAccount") && (
        <AddBankPayoutForm onSaved={onAdded} />
      )}
    </BottomSheet>
  );
}
