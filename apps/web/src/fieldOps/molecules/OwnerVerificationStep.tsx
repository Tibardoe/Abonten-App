"use client";

import { requestFieldOpsOwnerOtp } from "@/actions/fieldOps/requestFieldOpsOwnerOtp";
import { verifyFieldOpsOwnerOtp } from "@/actions/fieldOps/verifyFieldOpsOwnerOtp";
import OtpInput from "@/components/molecules/OtpInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toE164 } from "@/fieldOps/lib/wizardStorage";
import { useToast } from "@/hooks/useToast";
import { DEFAULT_PHONE_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

/**
 * Proving who the owner is, shared by the business and event wizards. The
 * code always goes to the OWNER's phone — never the member's — and online
 * members get a link the owner opens themselves so the code never passes
 * through the worker at all.
 */
export default function OwnerVerificationStep({
  campaignId,
  onboardingId,
  party,
  verified,
  onVerified,
  fullName,
  phone,
  onFullName,
  onPhone,
  dialCode,
}: {
  campaignId: string;
  onboardingId: string;
  /** The campaign region's dial prefix, so "024..." is read as local. */
  dialCode: string;
  /** Whose phone is verified: a business's owner or an event's organiser. */
  party: "owner" | "organiser";
  verified: boolean;
  onVerified: () => void;
  fullName: string;
  phone: string;
  onFullName: (v: string) => void;
  onPhone: (v: string) => void;
}) {
  const t = useTranslations("fieldOps");

  const toast = useToast();
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [consentPath, setConsentPath] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const send = () =>
    start(async () => {
      // The code is an SMS: a number that is not really E.164 would either
      // be refused or sent into the void, so it is normalised here first.
      const e164 = toE164(phone, dialCode);
      if (!e164) {
        toast.error(t("enterTheSPhoneEG", { party, dialCode }));
        return;
      }
      const res = await requestFieldOpsOwnerOtp({
        campaignId,
        onboardingId,
        ownerFullName: fullName.trim(),
        ownerPhoneE164: e164,
      });
      if (res.status === 200) {
        setSent(true);
        setConsentPath(res.data?.consentPath ?? null);
        toast.success(t("codeSentToThe", { party }));
      } else {
        toast.error(res.message ?? t("couldnTSendTheCode"));
      }
    });

  const verify = (value: string) =>
    start(async () => {
      const res = await verifyFieldOpsOwnerOtp({
        campaignId,
        onboardingId,
        code: value,
      });
      if (res.status === 200) {
        toast.success(t("verified2", { party }));
        onVerified();
      } else {
        toast.error(res.message ?? t("thatCodeDidnTWork"));
      }
    });

  if (verified) {
    return (
      <p className="rounded-md bg-emerald-500/10 p-3 text-sm">
        {t("verifiedTheirAbontenAccountWillOwn")}
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {t("aCodeGoesToTheS", { party })}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ov-name">{t("sFullName", { party })}</Label>
          <Input
            id="ov-name"
            value={fullName}
            onChange={(e) => onFullName(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ov-phone">{t("phoneNumber")}</Label>
          <Input
            id="ov-phone"
            inputMode="tel"
            placeholder="024 123 4567"
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
          />
        </div>
      </div>
      <Button
        type="button"
        onClick={send}
        disabled={
          pending || fullName.trim().length < 2 || phone.trim().length < 9
        }
      >
        {sent ? t("sendAnotherCode") : t("sendTheCode")}
      </Button>
      {sent ? (
        <div className="flex flex-col gap-2">
          {consentPath ? (
            <p className="rounded-md border border-dashed p-3 text-sm">
              {t("workingOverThePhoneSendThem")}
              <span className="break-all font-mono text-xs">
                {typeof window !== "undefined" ? window.location.origin : ""}
                {consentPath}
              </span>
            </p>
          ) : null}
          <Label>{t("codeFromTheirPhone")}</Label>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (v.length === DEFAULT_PHONE_OTP_CODE_LENGTH) verify(v);
            }}
            length={DEFAULT_PHONE_OTP_CODE_LENGTH}
          />
        </div>
      ) : null}
    </>
  );
}
