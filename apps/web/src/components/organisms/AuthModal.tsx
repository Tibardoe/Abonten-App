"use client";

import requestEmailOtp from "@/actions/requestEmailOtp";
import requestPhoneVerification from "@/actions/requestPhoneVerification";
import verifyEmailSignIn from "@/actions/verifyEmailSignIn";
import verifyPhoneSignIn from "@/actions/verifyPhoneSignIn";
import { useGetUserLocation } from "@/hooks/useUserLocation";
import InviteCodeField from "@/rewards/molecules/InviteCodeField";
import { LEGAL_PATHS } from "@abonten/core/brand/socialLinks";
import {
  EMAIL_OTP_CODE_LENGTH,
  isLikelyEmail,
  maskEmail,
} from "@abonten/core/emailOtp";
import { generateSlug } from "@abonten/core/geerateSlug";
import { logger } from "@abonten/core/logger";
import { maskPhoneNumber } from "@abonten/core/normalizePhoneNumber";
import { HUBTEL_OTP_CODE_LENGTH } from "@abonten/core/otpConstants";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IoChevronBack } from "react-icons/io5";
import GoogleAuthButton from "../atoms/GoogleAuthButton";
import OtpInput from "../molecules/OtpInput";
import PhoneInput from "../molecules/PhoneInput";
import ResendOtpButton from "../molecules/ResendOtpButton";
import { Button } from "../ui/button";

type PopupProp = {
  callingCode?: string;
  next?: string | null;
  authError?: string | null;
  /** Friend invites (Abonten Rewards): shown while invites are live. */
  invite?: { enabled: boolean; code: string | null };
};

// choose  -> method picker (Google / phone / email)
// phone-otp    -> 4-digit Hubtel code entry
// email-entry  -> email address entry
// email-otp    -> 6-digit Supabase code entry
type View = "choose" | "phone-otp" | "email-entry" | "email-otp";

export default function AuthModal({
  callingCode,
  next,
  authError,
  invite,
}: PopupProp) {
  const t = useTranslations("auth");

  const location = useGetUserLocation();

  const [view, setView] = useState<View>("choose");

  const [countryCode, setCountryCode] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneE164, setPhoneE164] = useState("");

  const [email, setEmail] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const [otp, setOtp] = useState("");

  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [sendErrorMessage, setSendErrorMessage] = useState<string | null>(
    authError ?? null,
  );
  const [otpErrorMessage, setOtpErrorMessage] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const logoSrc =
    mounted && resolvedTheme === "dark"
      ? "/assets/images/abonten-logo-white.svg"
      : "/assets/images/abonten-logo-black.svg";

  useEffect(() => {
    if (callingCode) {
      setCountryCode(callingCode);
    }
  }, [callingCode]);

  // Focus the email field when its screen appears (the codebase bans the
  // autoFocus attribute — see OtpInput.tsx, same pattern).
  useEffect(() => {
    if (view === "email-entry") emailInputRef.current?.focus();
  }, [view]);

  const redirectAfterAuth = () => {
    setIsRedirecting(true);
    // Full navigation (not router.push): the new session only exists in
    // cookies the browser just received on this action's response. A
    // client-side transition would leave every already-fetched React Query
    // cache holding its stale pre-sign-in state. Google avoids this trap
    // because /auth/callback issues a real HTTP redirect.
    window.location.href = next || `/explore/${generateSlug(location ?? "")}`;
  };

  // ---- phone ----------------------------------------------------------------

  const sendPhoneCode = async () => {
    setIsSendingOtp(true);
    setSendErrorMessage(null);

    try {
      const result = await requestPhoneVerification(
        countryCode,
        phone,
        "sign-in",
      );

      if (result.status !== 200) {
        setSendErrorMessage(result.message);
        return false;
      }

      setPhoneE164(result.phoneE164);
      return true;
    } catch (error) {
      logger.error("Phone Sign-In Error:", error);
      setSendErrorMessage("Something went wrong. Please try again.");
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
    if (sent) setView("phone-otp");
  };

  const handlePhoneOtpSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsVerifying(true);
    setOtpErrorMessage(null);

    try {
      const result = await verifyPhoneSignIn(phoneE164, otp);

      if (result.status !== 200) {
        setOtpErrorMessage(result.message);
        setIsVerifying(false);
        return;
      }

      redirectAfterAuth();
    } catch (error) {
      logger.error("OTP Verification Error:", error);
      setOtpErrorMessage(t("otpIncorrect"));
      setIsVerifying(false);
    }
  };

  // ---- email --------------------------------------------------------------

  const sendEmailCode = async () => {
    setIsSendingOtp(true);
    setSendErrorMessage(null);

    try {
      const result = await requestEmailOtp(email.trim());

      if (result.status !== 200) {
        setSendErrorMessage(result.message);
        return false;
      }

      setSubmittedEmail(email.trim());
      return true;
    } catch (error) {
      logger.error("Email Sign-In Error:", error);
      setSendErrorMessage("Something went wrong. Please try again.");
      return false;
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleEmailSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setOtpErrorMessage(null);

    if (!isLikelyEmail(email)) {
      setSendErrorMessage(t("emailInvalid"));
      return;
    }

    setOtp("");
    const sent = await sendEmailCode();
    if (sent) {
      setEmailNotice(t("emailCodeSent"));
      setView("email-otp");
    }
  };

  const handleEmailOtpSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsVerifying(true);
    setOtpErrorMessage(null);

    try {
      const result = await verifyEmailSignIn(submittedEmail, otp);

      if (result.status !== 200) {
        setOtpErrorMessage(result.message);
        setIsVerifying(false);
        return;
      }

      redirectAfterAuth();
    } catch (error) {
      logger.error("Email OTP Verification Error:", error);
      setOtpErrorMessage(t("otpIncorrect"));
      setIsVerifying(false);
    }
  };

  const backToChoose = () => {
    setView("choose");
    setOtp("");
    setOtpErrorMessage(null);
    setSendErrorMessage(null);
    setEmailNotice(null);
  };

  // ---- render ------------------------------------------------------------

  if (view === "choose") {
    return (
      <div className="w-full py-10 flex flex-col bg-background top-0 h-dvh z-30 fixed left-0 items-center overflow-y-auto">
        <div className="w-[90%] md:w-[70%] lg:w-[30%] text-foreground">
          <Image
            src={logoSrc}
            alt="Abonten Logo"
            width={100}
            height={100}
            className="object-contain w-20 h-20 md:w-32 md:h-32 mx-auto mb-5 md:mb-10"
          />

          <div className="space-y-5">
            <GoogleAuthButton location={location} next={next} />

            <button
              type="button"
              onClick={() => {
                setSendErrorMessage(null);
                setView("email-entry");
              }}
              className="flex items-center w-full bg-muted p-3 rounded-md disabled:opacity-70"
            >
              <span className="mx-auto font-medium">
                {t("continueWithEmail")}
              </span>
            </button>

            {/* Or section */}
            <div className="flex gap-2 items-center w-full text-muted-foreground">
              <span className="border border-border w-full" />
              <p>{t("or")}</p>
              <span className="border border-border w-full" />
            </div>

            <form onSubmit={handlePhoneSubmit} className="w-full space-y-5">
              <PhoneInput
                selectedCountry={countryCode}
                onSelectCountry={setCountryCode}
                onChange={setPhone}
              />

              {sendErrorMessage && (
                <p
                  role="alert"
                  className="text-destructive text-sm md:text-base"
                >
                  {sendErrorMessage}
                </p>
              )}

              <Button
                disabled={isSendingOtp}
                className="w-full rounded-md text-lg font-medium py-6"
              >
                {isSendingOtp ? t("sendingCode") : t("continue")}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {t("newToAbonten")}
              </p>
            </form>

            {invite?.enabled ? (
              <InviteCodeField initialCode={invite.code} />
            ) : null}

            <p className="text-center text-xs text-muted-foreground">
              {t.rich("consentNotice", {
                terms: (chunks) => (
                  <Link
                    href={LEGAL_PATHS.terms}
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link
                    href={LEGAL_PATHS.privacy}
                    className="font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (view === "email-entry") {
    return (
      <div className="w-full py-10 bg-background top-0 left-0 h-screen z-30 absolute">
        <div className="w-[90%] md:w-[70%] lg:w-[30%] mx-auto text-foreground h-full relative flex flex-col items-center">
          <button
            type="button"
            className="mr-auto mb-10 flex items-center"
            onClick={backToChoose}
          >
            <IoChevronBack className="text-2xl" />
            <p>{t("back")}</p>
          </button>

          <h1 className="font-bold text-4xl mb-2 text-foreground">
            {t("continueWithEmail")}
          </h1>

          <p className="text-muted-foreground text-lg mb-10 text-center">
            {t("emailEntryDescription")}
          </p>

          <form onSubmit={handleEmailSubmit} className="w-full space-y-5">
            <input
              ref={emailInputRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (sendErrorMessage) setSendErrorMessage(null);
              }}
              placeholder={t("emailPlaceholder")}
              aria-label={t("emailLabel")}
              aria-invalid={!!sendErrorMessage}
              className="w-full rounded-md bg-muted border border-input px-4 py-4 text-lg outline-none ring-1 ring-transparent focus:ring-2 focus:ring-ring"
            />

            {sendErrorMessage && (
              <p role="alert" className="text-destructive text-sm md:text-base">
                {sendErrorMessage}
              </p>
            )}

            <Button
              disabled={isSendingOtp || email.trim().length === 0}
              className="w-full rounded-md text-lg font-medium py-6"
            >
              {isSendingOtp ? t("sendingCode") : t("continue")}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // phone-otp / email-otp share one layout
  const isEmail = view === "email-otp";

  return (
    <div className="w-full py-10 bg-background top-0 left-0 h-screen z-30 absolute">
      <div className="w-[90%] md:w-[70%] lg:w-[30%] mx-auto text-foreground h-full relative flex flex-col items-center">
        <button
          type="button"
          className="mr-auto mb-10 flex items-center"
          onClick={() => setView(isEmail ? "email-entry" : "choose")}
        >
          <IoChevronBack className="text-2xl" />
          <p>{t("back")}</p>
        </button>

        <h1 className="font-bold text-4xl mb-2 text-foreground">
          {t("enterCode")}
        </h1>

        <div className="text-muted-foreground text-lg mb-10 text-center">
          <p>
            {t("codeSentTo")} <br />{" "}
            {isEmail ? maskEmail(submittedEmail) : maskPhoneNumber(phoneE164)}
          </p>
          {isEmail && emailNotice && (
            <p className="text-sm mt-2">{emailNotice}</p>
          )}
        </div>

        <form
          onSubmit={isEmail ? handleEmailOtpSubmit : handlePhoneOtpSubmit}
          className="w-full space-y-5"
        >
          <OtpInput
            value={otp}
            onChange={setOtp}
            disabled={isVerifying || isRedirecting}
            error={otpErrorMessage}
            length={isEmail ? EMAIL_OTP_CODE_LENGTH : HUBTEL_OTP_CODE_LENGTH}
          />

          <Button
            disabled={
              isVerifying ||
              isRedirecting ||
              otp.length !==
                (isEmail ? EMAIL_OTP_CODE_LENGTH : HUBTEL_OTP_CODE_LENGTH)
            }
            className="w-full rounded-md text-xl font-bold py-7"
          >
            {isRedirecting
              ? t("redirecting")
              : isVerifying
                ? t("verifying")
                : t("continue")}
          </Button>

          <div className="flex flex-col items-center gap-2 pt-2">
            <p className="text-sm text-muted-foreground">
              {t("didntReceiveCode")}
            </p>

            <div className="flex items-center gap-4">
              <ResendOtpButton
                onResend={isEmail ? sendEmailCode : sendPhoneCode}
                readyLabel={t("resendCode")}
                cooldownLabel={(seconds) => t("resendCodeIn", { seconds })}
              />

              <button
                type="button"
                className="text-sm md:text-base font-medium text-muted-foreground"
                onClick={() =>
                  isEmail ? setView("email-entry") : setView("choose")
                }
              >
                {isEmail ? t("useDifferentEmail") : t("changeNumber")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
