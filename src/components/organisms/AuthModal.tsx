"use client";

import requestPhoneVerification from "@/actions/requestPhoneVerification";
import verifyPhoneSignIn from "@/actions/verifyPhoneSignIn";
import { useGetUserLocation } from "@/hooks/useUserLocation";
import { generateSlug } from "@/utils/geerateSlug";
import { logger } from "@/utils/logger";
import { maskPhoneNumber } from "@/utils/normalizePhoneNumber";
import { HUBTEL_OTP_CODE_LENGTH } from "@/utils/otpConstants";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Image from "next/image";
import { useEffect, useState } from "react";
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
};

export default function AuthModal({ callingCode, next, authError }: PopupProp) {
  const t = useTranslations("auth");

  const location = useGetUserLocation();

  const [countryCode, setCountryCode] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1);

  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [sendErrorMessage, setSendErrorMessage] = useState<string | null>(
    authError ?? null,
  );
  const [otpErrorMessage, setOtpErrorMessage] = useState<string | null>(null);

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

  const sendCode = async () => {
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

    const sent = await sendCode();
    if (sent) setStep(2);
  };

  const handleOtpsubmit = async (event: React.FormEvent) => {
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

      // Switch to a distinct "redirecting" state instead of letting
      // isVerifying reset back to false -- otherwise the button would flash
      // back to "Continue" (briefly re-enabled) for the moment between the
      // action resolving and the navigation below actually taking effect.
      setIsRedirecting(true);

      // A full navigation (not router.push) is required here, not just a
      // style choice -- the new session only exists in cookies the browser
      // just received on this action's response. A client-side transition
      // would leave every already-fetched React Query cache (useCurrentUser,
      // user-details, etc.) holding its stale pre-sign-in state, so Header
      // would keep showing "Sign In" until something else happened to
      // refetch. Google's OAuth flow avoids this same trap because
      // /auth/callback issues a real HTTP redirect, which reloads the page.
      window.location.href = next || `/explore/${generateSlug(location ?? "")}`;
    } catch (error) {
      logger.error("OTP Verification Error:", error);
      setOtpErrorMessage(t("otpIncorrect"));
      setIsVerifying(false);
    }
  };

  const handleChange = (phoneNumber: string) => {
    setPhone(phoneNumber);
  };

  return step === 1 ? (
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

          {/* Or section */}
          <div className="flex gap-2 items-center w-full text-muted-foreground">
            <span className="border border-border w-full" />
            <p>{t("or")}</p>
            <span className="border border-border w-full" />
          </div>

          <form onSubmit={handlePhoneSubmit} className="w-full space-y-5">
            {/* Phone number option */}
            <PhoneInput
              selectedCountry={countryCode}
              onSelectCountry={setCountryCode}
              onChange={handleChange}
            />

            {sendErrorMessage && (
              <p role="alert" className="text-destructive text-sm md:text-base">
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
        </div>
      </div>
    </div>
  ) : (
    <div className="w-full py-10 bg-background top-0 left-0 h-screen z-30 absolute">
      <div className="w-[90%] md:w-[70%] lg:w-[30%] mx-auto text-foreground h-full relative flex flex-col items-center">
        <button
          type="button"
          className="mr-auto mb-10 flex items-center"
          onClick={() => setStep(1)}
        >
          <IoChevronBack className="text-2xl" />

          <p>{t("back")}</p>
        </button>

        <h1 className="font-bold text-4xl mb-2 text-foreground">
          {t("enterCode")}
        </h1>

        <div className="text-muted-foreground text-lg mb-10 text-center">
          <p>
            {t("codeSentTo")} <br /> {maskPhoneNumber(phoneE164)}
          </p>
        </div>

        <form onSubmit={handleOtpsubmit} className="w-full space-y-5">
          <OtpInput
            value={otp}
            onChange={setOtp}
            disabled={isVerifying}
            error={otpErrorMessage}
          />

          <Button
            disabled={
              isVerifying ||
              isRedirecting ||
              otp.length !== HUBTEL_OTP_CODE_LENGTH
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
                onResend={sendCode}
                readyLabel={t("resendCode")}
                cooldownLabel={(seconds) => t("resendCodeIn", { seconds })}
              />

              <button
                type="button"
                className="text-sm md:text-base font-medium text-muted-foreground"
                onClick={() => setStep(1)}
              >
                {t("changeNumber")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
