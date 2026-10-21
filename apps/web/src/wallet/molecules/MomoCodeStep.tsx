"use client";

import OtpInput from "@/components/molecules/OtpInput";
import { Button } from "@/components/ui/button";
import { formatPhoneInternational } from "@abonten/core/phone/phone";
import { useTranslations } from "next-intl";
import { useState } from "react";

type Props = {
  phoneE164: string;
  codeLength: number;
  /** "Save This Wallet", "Save payout account"… */
  submitLabel: string;
  busy: boolean;
  error: string | null;
  /** E.g. "A new code is on its way." after a resend. */
  note?: string | null;
  onSubmit: (code: string) => void;
  onResend: () => void;
  onChangeNumber: () => void;
};

// Second step of saving a mobile money number (a wallet, or a payout
// account): the code texted to it (payments/mobileMoneyNumberCheck). The
// parent sends the code with the save, resends, or goes back to the number.
// The app's twin is apps/mobile/src/features/wallet/MomoCodeStep.tsx.
export default function MomoCodeStep({
  phoneE164,
  codeLength,
  submitLabel,
  busy,
  error,
  note,
  onSubmit,
  onResend,
  onChangeNumber,
}: Props) {
  const t = useTranslations("wallet");
  const [code, setCode] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && code.length >= codeLength) onSubmit(code);
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-muted-foreground">
        {t("thisChecksTheNumberIsRight")}
      </p>
      <p className="text-sm">
        {t("enterTheCodeWeSentTo", {
          phone: formatPhoneInternational(phoneE164),
        })}
      </p>
      <OtpInput
        length={codeLength}
        value={code}
        onChange={setCode}
        disabled={busy}
        error={error}
      />
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || code.length < codeLength}>
          {busy ? t("saving") : submitLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setCode("");
            onResend();
          }}
        >
          {t("resendCode")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onChangeNumber}
        >
          {t("changeNumber")}
        </Button>
      </div>
    </form>
  );
}
