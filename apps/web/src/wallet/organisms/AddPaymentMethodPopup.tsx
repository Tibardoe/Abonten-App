"use client";

import type { PaymentMethodRow } from "@/actions/getUserPaymentMethods";
import { BottomSheet } from "@/components/atoms/BottomSheet";
import { useTranslations } from "next-intl";
import { useState } from "react";
import PaymentOptionCard from "../molecules/PaymentOptionCard";
import AddBankCard from "./AddBankCard";
import AddMomoWallet from "./AddMomoWallet";

type PopupCloseProp = {
  onclick: () => void;
  onAdded: (method: PaymentMethodRow) => void;
};

const STEP_TITLES: Record<string, string> = {
  "Mobile Money": "addMobileMoneyWallet",
  "Bank Card": "addBankCard",
};

export default function AddPaymentMethodPopup({
  onclick,
  onAdded,
}: PopupCloseProp) {
  const t = useTranslations("wallet");

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
          ? t("addAPaymentMethod")
          : STEP_TITLES[title]
            ? t(STEP_TITLES[title])
            : t("addWallet")
      }
      className="md:w-[30rem]"
    >
      {step === 1 && (
        <div className="space-y-3">
          <PaymentOptionCard
            imgUrl="/assets/images/phone.svg"
            optionTitle={t("mobileMoney2")}
            optionDetails={t("mtnTelecelAtMoneyGMoney")}
            handleStep={increaseStep}
          />

          <PaymentOptionCard
            imgUrl="/assets/images/bankCard.svg"
            optionTitle={t("bankCard")}
            optionDetails="Visa, Mastercard"
            handleStep={increaseStep}
          />
        </div>
      )}

      {step === 2 && title === t("mobileMoney2") && (
        <AddMomoWallet onSaved={onAdded} />
      )}
      {step === 2 && title === t("bankCard") && (
        <AddBankCard onSaved={onAdded} />
      )}
    </BottomSheet>
  );
}
