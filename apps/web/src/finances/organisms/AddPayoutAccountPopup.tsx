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

// The option chosen in step 1, as a code: its title is worded when shown.
type PayoutOption = "mobile_money" | "bank";

const STEP_TITLES = {
  mobile_money: "addMobileMoneyAccount",
  bank: "addBankAccount",
} as const;

// Mirrors AddPaymentMethodPopup.tsx's exact two-step shell (choose type,
// then fill the matching form) — same modal chrome, applied to organizer
// payout destinations instead of buyer payment methods.
export default function AddPayoutAccountPopup({
  onclick,
  onAdded,
}: PopupCloseProp) {
  const t = useTranslations("finances");

  const [step, setStep] = useState(1);
  const [option, setOption] = useState<PayoutOption | null>(null);

  const increaseStep = (chosen: PayoutOption) => {
    setOption(chosen);
    setStep((prevState) => prevState + 1);
  };

  return (
    <BottomSheet
      open
      onClose={onclick}
      title={
        step === 1
          ? t("addAPayoutAccount")
          : option
            ? t(STEP_TITLES[option])
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
            handleStep={() => increaseStep("mobile_money")}
          />

          <PaymentOptionCard
            imgUrl="/assets/images/bankCard.svg"
            optionTitle={t("bankAccount")}
            optionDetails={t("receiveEarningsDirectlyIntoYourBank")}
            handleStep={() => increaseStep("bank")}
          />
        </div>
      )}

      {step === 2 && option === "mobile_money" && (
        <AddMobileMoneyPayoutForm onSaved={onAdded} />
      )}
      {step === 2 && option === "bank" && (
        <AddBankPayoutForm onSaved={onAdded} />
      )}
    </BottomSheet>
  );
}
