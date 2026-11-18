"use client";

import { resendFieldOpsConsentCode } from "@/actions/fieldOps/resendFieldOpsConsentCode";
import { verifyFieldOpsConsent } from "@/actions/fieldOps/verifyFieldOpsConsent";
import OtpInput from "@/components/molecules/OtpInput";
import ResendOtpButton from "@/components/molecules/ResendOtpButton";
import { Button } from "@/components/ui/button";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { DEFAULT_PHONE_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

/** The owner enters the code on their own phone (online onboarding). */
export default function ConsentForm({
  token,
  kind,
}: {
  token: string;
  kind: "place" | "event";
}) {
  const t = useTranslations("fieldOps");

  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Codes last minutes and the link a day, so an owner who opens the link
  // later asks for a fresh code here instead of going back to the sender.
  const resend = async () => {
    setError(null);
    setNotice(null);
    const res = await resendFieldOpsConsentCode({ token }).catch(
      actionUnreachable,
    );
    if (res.status === 200) setNotice(res.message ?? t("weSentYouANewCode"));
    else setError(res.message ?? t("couldNotSendANewCode"));
  };

  const submit = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      const res = await verifyFieldOpsConsent({ token, code }).catch(
        actionUnreachable,
      );
      if (res.status === 200) setDone(true);
      else setError(res.message ?? t("thatCodeDidnTWork"));
    });

  if (done) {
    return (
      <p className="rounded-xl border bg-emerald-500/10 p-4 text-sm">
        {kind === "event"
          ? t("thankYouYourEventCanNow")
          : t("thankYouYourBusinessCanNow")}
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
          {pending
            ? t("checking")
            : kind === "event"
              ? t("iAgreeListMyEvent")
              : t("iAgreeListMyBusiness")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          {t("noCodeOrDidItRunOut")}
        </span>
        <ResendOtpButton
          onResend={resend}
          initialSecondsLeft={0}
          disabled={pending}
          readyLabel={t("sendMeANewCode")}
        />
      </div>
      {notice && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {notice}
        </p>
      )}
      {/* If the boxes won't take the code on their phone, the team member
          who sent the link can enter it for them. */}
      <p className="text-xs text-muted-foreground">
        {t("cantEnterTheCodeHere")}
      </p>
    </div>
  );
}
