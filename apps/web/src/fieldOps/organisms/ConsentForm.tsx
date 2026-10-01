"use client";

import { verifyFieldOpsConsent } from "@/actions/fieldOps/verifyFieldOpsConsent";
import OtpInput from "@/components/molecules/OtpInput";
import { Button } from "@/components/ui/button";
import { DEFAULT_PHONE_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

/** The owner enters the code on their own phone (online onboarding). */
export default function ConsentForm({ token }: { token: string }) {
  const t = useTranslations("fieldOps");

  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await verifyFieldOpsConsent({ token, code });
      if (res.status === 200) setDone(true);
      else setError(res.message ?? t("thatCodeDidnTWork"));
    });

  if (done) {
    return (
      <p className="rounded-xl border bg-emerald-500/10 p-4 text-sm">
        {t("thankYouYourBusinessCanNow")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <OtpInput
        value={code}
        onChange={setCode}
        disabled={pending}
        error={error}
      />
      <div>
        <Button
          onClick={submit}
          disabled={pending || code.length < DEFAULT_PHONE_OTP_CODE_LENGTH}
        >
          {pending ? t("checking") : t("iAgreeListMyBusiness")}
        </Button>
      </div>
    </div>
  );
}
