"use client";

import deleteUser from "@/actions/deleteUser";
import requestPhoneVerification from "@/actions/requestPhoneVerification";
import updateVerifiedPhone from "@/actions/updateVerifiedPhone";
import { supabase } from "@/config/supabase/client";
import { maskPhoneNumber } from "@/utils/normalizePhoneNumber";
import { HUBTEL_OTP_CODE_LENGTH } from "@/utils/otpConstants";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import Input from "../atoms/Input";
import MaskIcon from "../atoms/MaskIcon";
import Notification from "../atoms/Notification";
import OtpInput from "../molecules/OtpInput";
import PhoneInput from "../molecules/PhoneInput";
import ResendOtpButton from "../molecules/ResendOtpButton";
import { Button } from "../ui/button";

type Props = {
  initialPhone: string | null;
  initialPhoneVerified: boolean;
  initialEmail: string | null;
  initialEmailVerified: boolean;
  initialCallingCode?: string;
};

export default function SecurityInputFields({
  initialPhone,
  initialPhoneVerified,
  initialEmail,
  initialEmailVerified,
  initialCallingCode,
}: Props) {
  const [notification, setNotification] = useState<string | null>(null);

  // step 1: overview, step 2: enter new phone, step 3: verify OTP
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [currentPhone, setCurrentPhone] = useState(initialPhone);
  const [currentPhoneVerified, setCurrentPhoneVerified] =
    useState(initialPhoneVerified);

  const { register, handleSubmit } = useForm({
    defaultValues: { email: initialEmail ?? "" },
  });
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false);

  const [countryCode, setCountryCode] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
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
    const response = await deleteUser();
    setNotification(response.message);
  };

  const handleEmailSubmit = handleSubmit(async ({ email }) => {
    if (!email || email === initialEmail) return;

    setIsUpdatingEmail(true);

    try {
      const { error } = await supabase.auth.updateUser(
        { email },
        {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/settings/security")}`,
        },
      );

      if (error) {
        setNotification(error.message);
        return;
      }

      setNotification(
        `We've sent a confirmation link to ${email}. Click it to verify your new email.`,
      );
    } catch (error) {
      console.error("Email update error:", error);
      setNotification("Something went wrong. Please try again.");
    } finally {
      setIsUpdatingEmail(false);
    }
  });

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
      return true;
    } catch (error) {
      console.error("Phone update send error:", error);
      setPhoneErrorMessage("Something went wrong. Please try again.");
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
      setNotification(response.message);
      setStep(1);
    } catch (error) {
      console.error("Phone update verify error:", error);
      setOtpErrorMessage("Verification failed. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <>
      {step === 1 && (
        <div className="flex flex-col gap-5">
          <div className="space-y-2">
            <span className="font-medium md:text-lg">Phone</span>

            <div className="w-full flex justify-between items-center gap-5 p-3 rounded-md border border-border">
              <span className="text-muted-foreground">
                {currentPhone
                  ? `${maskPhoneNumber(currentPhone)}${currentPhoneVerified ? "" : " (unverified)"}`
                  : "No phone number added"}
              </span>

              <button
                type="button"
                className="font-semibold text-foreground/70"
                onClick={() => setStep(2)}
              >
                {currentPhone ? "Change" : "Add"}
              </button>
            </div>
          </div>

          <form onSubmit={handleEmailSubmit} className="space-y-2">
            <Input
              title="Email"
              inputPlaceholder="Email"
              {...register("email")}
            />

            {initialEmail && !initialEmailVerified && (
              <p className="text-sm text-muted-foreground">
                This email hasn't been verified yet.
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
                  alt="Delete icon"
                  className="w-6 h-6 md:w-8 md:h-8 bg-destructive"
                />
                Delete account
              </button>

              <Button
                disabled={isUpdatingEmail}
                className="self-end font-medium"
              >
                {isUpdatingEmail ? "Updating..." : "Update"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {step === 2 && (
        <div className="md:w-[70%] mx-auto bg-card text-card-foreground p-5 flex-col items-center gap-5 rounded-lg flex shadow-lg">
          <div className="mb-5">
            <h1 className="font-bold text-3xl">Update phone number</h1>

            <p className="text-sm text-muted-foreground">
              We&apos;ll send an SMS code for verification
            </p>
          </div>

          <form onSubmit={handlePhoneSubmit} className="w-full space-y-5">
            <PhoneInput
              selectedCountry={countryCode}
              onSelectCountry={setCountryCode}
              onChange={setPhone}
            />

            {phoneErrorMessage && (
              <p className="text-destructive text-sm md:text-base">
                {phoneErrorMessage}
              </p>
            )}

            <div className="flex items-center gap-1">
              <Button
                type="button"
                className="w-full rounded-md md:text-lg font-bold py-6"
                onClick={() => setStep(1)}
              >
                Back
              </Button>

              <Button
                className="w-full rounded-md md:text-lg font-bold py-6"
                type="submit"
                disabled={isSendingOtp}
              >
                {isSendingOtp ? "Sending..." : "Continue"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {step === 3 && (
        <div className="w-full md:w-[80%] mx-auto bg-card text-card-foreground px-10 py-5 flex-col items-center gap-5 rounded-xl flex shadow-lg">
          <div className="flex flex-col items-center">
            <h1 className="font-bold text-3xl">Enter Code</h1>

            <p>
              We&apos;ve sent it to <br /> {maskPhoneNumber(phoneE164)}
            </p>
          </div>

          <form onSubmit={handleOtpsubmit} className="space-y-5 w-full">
            <OtpInput
              value={otp}
              onChange={setOtp}
              disabled={isVerifying}
              error={otpErrorMessage}
            />

            <div className="flex items-center gap-1">
              <Button
                type="button"
                className="w-full rounded-md md:text-lg font-bold py-6"
                onClick={() => setStep(2)}
              >
                Edit number
              </Button>

              <Button
                className="w-full rounded-md md:text-lg font-bold py-6"
                disabled={isVerifying || otp.length !== HUBTEL_OTP_CODE_LENGTH}
              >
                {isVerifying ? "Verifying..." : "Continue"}
              </Button>
            </div>

            <div className="flex justify-center">
              <ResendOtpButton onResend={sendPhoneCode} />
            </div>
          </form>
        </div>
      )}

      <Notification notification={notification} />
    </>
  );
}
