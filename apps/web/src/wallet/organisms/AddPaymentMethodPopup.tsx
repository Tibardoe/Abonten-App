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

// The option chosen in step 1, as a code: its title is worded when shown.
type MethodOption = "mobile_money" | "card";

const STEP_TITLES = {
  mobile_money: "addMobileMoneyWallet",
  card: "addBankCard",
} as const;

export default function AddPaymentMethodPopup({
  onclick,
  onAdded,
}: PopupCloseProp) {
  const t = useTranslations("wallet");

  const [step, setStep] = useState(1);

  const [option, setOption] = useState<MethodOption | null>(null);

  const increaseStep = (chosen: MethodOption) => {
    setOption(chosen);
    setStep((prevState) => prevState + 1);
  };

  return (
    <BottomSheet
      open
      onClose={onclick}
      title={
        step === 1
          ? t("addAPaymentMethod")
          : option
            ? t(STEP_TITLES[option])
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
            handleStep={() => increaseStep("mobile_money")}
          />

          <PaymentOptionCard
            imgUrl="/assets/images/bankCard.svg"
            optionTitle={t("bankCard")}
            optionDetails="Visa, Mastercard"
            handleStep={() => increaseStep("card")}
          />
        </div>
      )}

      {step === 2 && option === "mobile_money" && (
        <AddMomoWallet onSaved={onAdded} />
      )}
      {step === 2 && option === "card" && <AddBankCard onSaved={onAdded} />}
    </BottomSheet>
  );
}
