"use client";

import deleteUser from "@/actions/deleteUser";
import requestPhoneVerification from "@/actions/requestPhoneVerification";
import updateVerifiedPhone from "@/actions/updateVerifiedPhone";
import { supabase } from "@/config/supabase/client";
import { useConfirm } from "@/hooks/useConfirm";
import { useToast } from "@/hooks/useToast";
import { linkGoogleIdentity } from "@/services/authService";
import { actionUnreachable } from "@/utils/actionUnreachable";
import {
  EMAIL_OTP_CODE_LENGTH,
  emailOtpMessage,
  isLikelyEmail,
  maskEmail,
} from "@abonten/core/emailOtp";
import { logger } from "@abonten/core/logger";
import { maskPhoneNumber } from "@abonten/core/normalizePhoneNumber";
import { DEFAULT_PHONE_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Input from "../atoms/Input";
import MaskIcon from "../atoms/MaskIcon";
import OtpInput from "../molecules/OtpInput";
import PhoneInput from "../molecules/PhoneInput";
import ResendOtpButton from "../molecules/ResendOtpButton";
import { Button } from "../ui/button";

type Props = {
  initialPhone: string | null;
  initialPhoneVerified: boolean;
  initialEmail: string | null;
  initialEmailVerified: boolean;
  hasGoogleIdentity: boolean;
  initialCallingCode?: string;
};

export default function SecurityInputFields({
  initialPhone,
  initialPhoneVerified,
  initialEmail,
  initialEmailVerified,
  hasGoogleIdentity,
  initialCallingCode,
}: Props) {
  const t = useTranslations("settings.security.phone");
  const tc = useTranslations("core");
  const tAuth = useTranslations("auth");
  const searchParams = useSearchParams();
  const toast = useToast();
  const confirm = useConfirm();
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only meant to run once on mount, to surface a one-time OAuth redirect error carried in the URL.
  useEffect(() => {
    const authError = searchParams.get("authError");
    if (authError) toast.error(authError);
  }, []);

  const handleLinkGoogle = async () => {
    setIsLinkingGoogle(true);

    try {
      await linkGoogleIdentity("/settings/security");
      // No need to reset isLinkingGoogle -- linkIdentity navigates away.
    } catch (error) {
      logger.error("Link Google account error:", error);
      toast.error(t("somethingWentWrongPleaseTryAgain"));
      setIsLinkingGoogle(false);
    }
  };

  // Account setup (checklist, reminder card, badge) counts a verified email
  // and phone — refresh it as soon as either changes here.
  const queryClient = useQueryClient();
  const refreshAccountSetup = () =>
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] === "profile-completion",
    });

  // step 1: overview, step 2: enter new phone, step 3: verify OTP
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [currentPhone, setCurrentPhone] = useState(initialPhone);
  const [currentPhoneVerified, setCurrentPhoneVerified] =
    useState(initialPhoneVerified);

  // Add / change email — a 6-digit code flow (verifyOtp type "email_change"),
  // not the old confirmation-link that dead-ended on /auth/callback. Runs on
  // the caller's existing session, so it never signs the user out.
  //
  // "code"         -> enter the code sent to the NEW address
  // "code-current" -> only when Supabase's "Secure email change" is on: it
  //                   also mails a code to the CURRENT address, and the
  //                   change only completes once BOTH are confirmed.
  const [emailInput, setEmailInput] = useState(initialEmail ?? "");
  const [emailStep, setEmailStep] = useState<"idle" | "code" | "code-current">(
    "idle",
  );
  const [pendingEmail, setPendingEmail] = useState("");
  const [changeFromEmail, setChangeFromEmail] = useState<string | null>(null);
  const [emailOtp, setEmailOtp] = useState("");
  const [isSendingEmailCode, setIsSendingEmailCode] = useState(false);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = useState<string | null>(
    null,
  );
  const [currentEmail, setCurrentEmail] = useState(initialEmail);
  const [currentEmailVerified, setCurrentEmailVerified] =
    useState(initialEmailVerified);

  const [countryCode, setCountryCode] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [phoneCodeLength, setPhoneCodeLength] = useState(
    DEFAULT_PHONE_OTP_CODE_LENGTH,
  );
  const [otp, setOtp] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [phoneErrorMessage, setPhoneErrorMessage] = useState<string | null>(
    null,
  );
  const [otpErrorMessage, setOtpErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialCallingCode) setCountryCode(initialCallingCode);
  }, [initialCallingCode]);

  const handleDeleteUser = async () => {
    const confirmed = await confirm({
      title: t("deleteAccountTitle"),
      message: t("deleteAccountBody"),
      confirmLabel: t("deleteAccount"),
    });
    if (!confirmed) return;
    const response = await deleteUser().catch(actionUnreachable);
    if (response.status === 200) {
      toast.success(response.message);
      // The account is gone server-side (sessions revoked); drop the local
      // session too and leave the signed-in area instead of staying on a
      // settings page that can no longer load anything.
      await supabase.auth.signOut().catch(() => {});
      window.location.assign("/");
    } else {
      toast.error(response.message);
    }
  };

  const sendEmailChangeCode = async () => {
    const email = emailInput.trim().toLowerCase();

    if (!isLikelyEmail(email)) {
      setEmailErrorMessage(t("enterAValidEmailAddress"));
      return false;
    }
    if (email === currentEmail) {
      setEmailErrorMessage(t("thatSAlreadyYourEmailAddress"));
      return false;
    }

    setIsSendingEmailCode(true);
    setEmailErrorMessage(null);

    try {
      // Supabase emails a 6-digit code (the "Confirm email change" template
      // must include {{ .Token }} — see docs/architecture/email-auth.md).
      const { error } = await supabase.auth.updateUser({ email });

      if (error) {
        // Don't echo provider text that could confirm the address belongs
        // to someone else (enumeration guard).
        const conflict =
          error.status === 422 ||
          /already.*(registered|exists|in use)/i.test(error.message);
        setEmailErrorMessage(
          conflict ? t("thatEmailCanTBeUsed") : t("couldnTSendACodePlease"),
        );
        return false;
      }

      setPendingEmail(email);
      setChangeFromEmail(currentEmail);
      return true;
    } catch (error) {
      logger.error("Email change send error:", error);
      setEmailErrorMessage(t("somethingWentWrongPleaseTryAgain"));
      return false;
    } finally {
      setIsSendingEmailCode(false);
    }
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setEmailOtp("");
    const sent = await sendEmailChangeCode();
    if (sent) setEmailStep("code");
  };

  // Marks the change fully applied and returns to the overview.
  const finishEmailChange = (confirmed: boolean) => {
    setCurrentEmail(pendingEmail);
    setCurrentEmailVerified(confirmed);
    setEmailInput(pendingEmail);
    setChangeFromEmail(null);
    setEmailStep("idle");
    setEmailOtp("");
    toast.success(t("emailUpdated"));
    refreshAccountSetup();
  };

  // Supabase answers a wrong code and an expired one identically, so there
  // is nothing to branch on here — see emailOtpMessage(tc, "invalidOrExpired").
  const mapOtpError = () => emailOtpMessage(tc, "invalidOrExpired");

  // Step 1: the code sent to the NEW address.
  const handleEmailOtpSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsVerifyingEmail(true);
    setEmailErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: emailOtp,
        type: "email_change",
      });

      if (error) {
        setEmailErrorMessage(mapOtpError());
        return;
      }

      // With Supabase's "Secure email change" ON, the address only flips
      // once the CURRENT address is also confirmed — go collect that code.
      // With it OFF, email_confirmed_at is already set and we're done.
      if (data.user?.email_confirmed_at) {
        finishEmailChange(true);
      } else {
        setEmailOtp("");
        setEmailStep("code-current");
      }
    } catch (error) {
      logger.error("Email change verify error:", error);
      setEmailErrorMessage(t("verificationFailedPleaseTryAgain"));
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  // Step 2 (Secure email change only): the code sent to the CURRENT address.
  const handleCurrentEmailOtpSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!changeFromEmail) return;
    setIsVerifyingEmail(true);
    setEmailErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: changeFromEmail,
        token: emailOtp,
        type: "email_change",
      });

      if (error) {
        setEmailErrorMessage(mapOtpError());
        return;
      }

      finishEmailChange(!!data.user?.email_confirmed_at);
    } catch (error) {
      logger.error("Email change (current) verify error:", error);
      setEmailErrorMessage(t("verificationFailedPleaseTryAgain"));
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  const sendPhoneCode = async () => {
    setIsSendingOtp(true);
    setPhoneErrorMessage(null);

    try {
      const result = await requestPhoneVerification(
        countryCode,
        phone,
        "phone-update",
      );

      if (result.status !== 200) {
        setPhoneErrorMessage(result.message);
        return false;
      }

      setPhoneE164(result.phoneE164);
      setPhoneCodeLength(result.codeLength);
      return true;
    } catch (error) {
      logger.error("Phone update send error:", error);
      setPhoneErrorMessage(t("somethingWentWrongPleaseTryAgain"));
      return false;
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handlePhoneSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setOtp("");
    setOtpErrorMessage(null);

    const sent = await sendPhoneCode();
    if (sent) setStep(3);
  };

  const handleOtpsubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsVerifying(true);
    setOtpErrorMessage(null);

    try {
      const response = await updateVerifiedPhone(phoneE164, otp);

      if (response.status !== 200) {
        setOtpErrorMessage(response.message);
        return;
      }

      setCurrentPhone(phoneE164);
      setCurrentPhoneVerified(true);
      toast.success(response.message);
      refreshAccountSetup();
      setStep(1);
    } catch (error) {
      logger.error("Phone update verify error:", error);
      setOtpErrorMessage(t("verificationFailedPleaseTryAgain"));
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <>
      {step === 1 && (
        <div className="space-y-3">
          <div>
            <h2 className="font-semibold">{t("accountSecurity")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("usedToSignInAndVerify")}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card text-card-foreground p-4 md:p-5 flex flex-col gap-5">
            <div className="space-y-2">
              <span className="font-medium md:text-lg">{t("label")}</span>

              <div className="w-full flex justify-between items-center gap-5 p-3 rounded-md border border-border">
                <span className="text-muted-foreground">
                  {currentPhone
                    ? `${maskPhoneNumber(currentPhone)}${currentPhoneVerified ? "" : ` ${t("unverified")}`}`
                    : t("noPhoneAdded")}
                </span>

                <button
                  type="button"
                  className="font-semibold text-foreground/70"
                  onClick={() => setStep(2)}
                >
                  {currentPhone ? t("change") : t("add")}
                </button>
              </div>
            </div>

            {!hasGoogleIdentity && (
              <div className="space-y-2">
                <span className="font-medium md:text-lg">
                  {t("googleAccount")}
                </span>

                <div className="w-full flex justify-between items-center gap-5 p-3 rounded-md border border-border">
                  <span className="text-muted-foreground">
                    {t("notLinked")}
                  </span>

                  <button
                    type="button"
                    className="font-semibold text-foreground/70 disabled:opacity-60"
                    onClick={handleLinkGoogle}
                    disabled={isLinkingGoogle}
                  >
                    {isLinkingGoogle ? t("redirecting") : t("link")}
                  </button>
                </div>
              </div>
            )}

            {emailStep === "idle" ? (
              <form onSubmit={handleEmailSubmit} className="space-y-2">
                <Input
                  title={t("email")}
                  inputPlaceholder="you@example.com"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={emailInput}
                  onChange={(event) => {
                    setEmailInput(event.target.value);
                    if (emailErrorMessage) setEmailErrorMessage(null);
                  }}
                />

                {currentEmail && !currentEmailVerified && (
                  <p className="text-sm text-muted-foreground">
                    {t("thisEmailHasnTBeenVerified")}
                  </p>
                )}

                {emailErrorMessage && (
                  <p
                    role="alert"
                    className="text-destructive text-sm md:text-base"
                  >
                    {emailErrorMessage}
                  </p>
                )}

                <div className="flex justify-between items-center pt-3">
                  <button
                    type="button"
                    onClick={handleDeleteUser}
                    className="text-destructive flex items-center gap-1 font-bold md:text-lg"
                  >
                    <MaskIcon
                      src="/assets/images/delete.svg"
                      alt={t("deleteIcon")}
                      className="w-6 h-6 md:w-8 md:h-8 bg-destructive"
                    />
                    {t("deleteAccount")}
                  </button>

                  <Button
                    disabled={
                      isSendingEmailCode ||
                      emailInput.trim().length === 0 ||
                      emailInput.trim().toLowerCase() === currentEmail
                    }
                    className="self-end font-medium"
                  >
                    {isSendingEmailCode
                      ? tAuth("sendingCode")
                      : currentEmail
                        ? t("change")
                        : t("add")}
                  </Button>
                </div>
              </form>
            ) : emailStep === "code" ? (
              <form onSubmit={handleEmailOtpSubmit} className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {tAuth("codeSentToAddress", {
                    address: maskEmail(pendingEmail),
                  })}
                </p>

                <OtpInput
                  value={emailOtp}
                  onChange={setEmailOtp}
                  disabled={isVerifyingEmail}
                  error={emailErrorMessage}
                  length={EMAIL_OTP_CODE_LENGTH}
                />

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    className="w-full rounded-md md:text-lg font-bold py-6"
                    onClick={() => {
                      setEmailStep("idle");
                      setEmailErrorMessage(null);
                    }}
                  >
                    {tAuth("back")}
                  </Button>

                  <Button
                    className="w-full rounded-md md:text-lg font-bold py-6"
                    disabled={
                      isVerifyingEmail ||
                      emailOtp.length !== EMAIL_OTP_CODE_LENGTH
                    }
                  >
                    {isVerifyingEmail ? tAuth("verifying") : tAuth("continue")}
                  </Button>
                </div>

                <div className="flex justify-center">
                  <ResendOtpButton
                    onResend={sendEmailChangeCode}
                    readyLabel={tAuth("resendCode")}
                    cooldownLabel={(seconds) =>
                      tAuth("resendCodeIn", { seconds })
                    }
                  />
                </div>
              </form>
            ) : (
              <form
                onSubmit={handleCurrentEmailOtpSubmit}
                className="space-y-3"
              >
                <p className="text-sm text-muted-foreground">
                  {t("oneMoreStepEnterTheCode")}
                  {changeFromEmail ? `, ${maskEmail(changeFromEmail)}` : ""}.
                </p>

                <OtpInput
                  value={emailOtp}
                  onChange={setEmailOtp}
                  disabled={isVerifyingEmail}
                  error={emailErrorMessage}
                  length={EMAIL_OTP_CODE_LENGTH}
                />

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    className="w-full rounded-md md:text-lg font-bold py-6"
                    onClick={() => {
                      setEmailStep("idle");
                      setChangeFromEmail(null);
                      setEmailOtp("");
                      setEmailErrorMessage(null);
                    }}
                  >
                    {tAuth("back")}
                  </Button>

                  <Button
                    className="w-full rounded-md md:text-lg font-bold py-6"
                    disabled={
                      isVerifyingEmail ||
                      emailOtp.length !== EMAIL_OTP_CODE_LENGTH
                    }
                  >
                    {isVerifyingEmail ? tAuth("verifying") : tAuth("continue")}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="md:w-[70%] mx-auto bg-card text-card-foreground p-5 flex-col items-center gap-5 rounded-lg flex shadow-lg">
          <div className="mb-5">
            <h1 className="font-bold text-3xl">{t("updateTitle")}</h1>

            <p className="text-sm text-muted-foreground">
              {t("updateDescription")}
            </p>
          </div>

          <form onSubmit={handlePhoneSubmit} className="w-full space-y-5">
            <PhoneInput
              selectedCountry={countryCode}
              onSelectCountry={setCountryCode}
              onChange={setPhone}
            />

            {phoneErrorMessage && (
              <p role="alert" className="text-destructive text-sm md:text-base">
                {phoneErrorMessage}
              </p>
            )}

            <div className="flex items-center gap-1">
              <Button
                type="button"
                className="w-full rounded-md md:text-lg font-bold py-6"
                onClick={() => setStep(1)}
              >
                {tAuth("back")}
              </Button>

              <Button
                className="w-full rounded-md md:text-lg font-bold py-6"
                type="submit"
                disabled={isSendingOtp}
              >
                {isSendingOtp ? tAuth("sendingCode") : tAuth("continue")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {step === 3 && (
        <div className="w-full md:w-[80%] mx-auto bg-card text-card-foreground px-10 py-5 flex-col items-center gap-5 rounded-xl flex shadow-lg">
          <div className="flex flex-col items-center">
            <h1 className="font-bold text-3xl">{t("enterCodeTitle")}</h1>

            <p>
              {tAuth("codeSentTo")} <br /> {maskPhoneNumber(phoneE164)}
            </p>

            <p className="text-sm text-muted-foreground mt-1">
              {t("codeExpiry")}
            </p>
          </div>

          <form onSubmit={handleOtpsubmit} className="space-y-5 w-full">
            <OtpInput
              value={otp}
              onChange={setOtp}
              disabled={isVerifying}
              error={otpErrorMessage}
              length={phoneCodeLength}
            />

            <div className="flex items-center gap-1">
              <Button
                type="button"
                className="w-full rounded-md md:text-lg font-bold py-6"
                onClick={() => setStep(2)}
              >
                {t("editNumber")}
              </Button>

              <Button
                className="w-full rounded-md md:text-lg font-bold py-6"
                disabled={isVerifying || otp.length !== phoneCodeLength}
              >
                {isVerifying ? tAuth("verifying") : tAuth("continue")}
              </Button>
            </div>

            <div className="flex justify-center">
              <ResendOtpButton
                onResend={sendPhoneCode}
                readyLabel={tAuth("resendCode")}
                cooldownLabel={(seconds) => tAuth("resendCodeIn", { seconds })}
              />
            </div>
          </form>
        </div>
      )}
    </>
  );
}
