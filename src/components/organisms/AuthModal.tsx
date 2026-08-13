"use client";

import { useGetUserLocation } from "@/hooks/useUserLocation";
import { signInWithPhone, verifyOtp } from "@/services/authService";
import { phoneNumberFormatter } from "@/utils/phoneNumberFormatter";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IoChevronBack } from "react-icons/io5";
import { LiaTimesSolid } from "react-icons/lia";
import GoogleAuthButton from "../atoms/GoogleAuthButton";
import PhoneInput from "../molecules/PhoneInput";
import { Button } from "../ui/button";

type PopupProp = {
  callingCode?: string;
  next?: string | null;
};

export default function AuthModal({ callingCode, next }: PopupProp) {
  const t = useTranslations("auth");

  const location = useGetUserLocation();

  const [countryCode, setCountryCode] = useState("");

  const [phone, setPhone] = useState("");

  const [otp, setOtp] = useState("");

  const [step, setStep] = useState(1);

  const [otpArray, setOtpArray] = useState(["", "", "", "", "", ""]);

  const [otpErrorMessageShown, setOtpErrorMessageShown] = useState(false);

  const router = useRouter();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const logoSrc =
    mounted && resolvedTheme === "dark"
      ? "/assets/images/abonten-logo-white.svg"
      : "/assets/images/abonten-logo-black.svg";

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const setInputRef = (el: HTMLInputElement | null, index: number) => {
    inputRefs.current[index] = el;
  };

  const fullPhoneNumber = `${countryCode}${phone}`;

  useEffect(() => {
    if (callingCode) {
      setCountryCode(callingCode);
    }
  }, [callingCode]);

  const handlePhoneSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      await signInWithPhone(`${countryCode}${phone}`);
      setStep(2);
    } catch (error) {
      console.error("Phone Sign-In Error:", error);
    }
  };

  const handleOtpsubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      // await verifyOtp(fullPhoneNumber, otp);
      router.push(next || "/events");
    } catch (error) {
      console.error("OTP Verification Error:", error);
      setOtpErrorMessageShown(true);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return; // Allow only single digit input

    const newOtpArray = [...otpArray];
    newOtpArray[index] = value;
    setOtpArray(newOtpArray);
    setOtp(newOtpArray.join(""));

    // Move focus to next input
    if (value && index < otpArray.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleBackspace = (index: number, event: React.KeyboardEvent) => {
    if (event.key === "Backspace" && !otpArray[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    event.preventDefault();
    const pastedData = event.clipboardData.getData("text").trim();
    if (/^\d{6}$/.test(pastedData)) {
      const newOtpArray = pastedData.split("");
      setOtpArray(newOtpArray);
      setOtp(pastedData);
      inputRefs.current[5]?.focus(); // Move focus to last input
    }
  };

  const handleChange = async (phoneNumber: string) => {
    const formattedPhone = phoneNumberFormatter(phoneNumber);
    setPhone(formattedPhone);
  };

  return step === 1 ? (
    <div className="w-full py-10 flex flex-col bg-background top-0 h-dvh z-30 fixed left-0 items-center">
      <div className="w-[90%] md:w-[70%] lg:w-[30%] text-foreground h-screen relative">
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
          <div className="flex gap-2 items-center w-full text-iconGray">
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

            <Button className="w-full rounded-md text-lg font-medium py-6 absolute bottom-0 md:relative">
              {t("continue")}
            </Button>
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
          onClick={() => setStep((prev) => Math.max(1, prev - 1))}
        >
          <IoChevronBack className="text-2xl" />

          <p>{t("back")}</p>
        </button>

        <h1 className="font-bold text-4xl mb-2 text-foreground">
          {t("enterCode")}
        </h1>

        <div className="text-muted-foreground text-lg mb-20">
          <p>
            {t("codeSentTo")} <br /> {fullPhoneNumber}
          </p>
        </div>

        <form onSubmit={handleOtpsubmit} className="w-full space-y-5">
          <div className="flex flex-col gap-3 items-center">
            <div className="flex gap-3 w-full" onPaste={handlePaste}>
              {otpArray.map((digit, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                  key={index}
                  className="w-[70px] h-[60px] flex justify-center items-center rounded-2xl bg-muted text-xl"
                >
                  <input
                    type="text"
                    value={digit}
                    maxLength={1}
                    className="w-full h-full text-center outline-none rounded-2xl bg-transparent"
                    ref={(el) => setInputRef(el, index)}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleBackspace(index, e)}
                  />
                </div>
              ))}
            </div>

            {otpErrorMessageShown && (
              <p className="text-destructive text-lg">{t("otpIncorrect")}</p>
            )}
          </div>

          <Button className="w-full rounded-md text-xl font-bold py-7">
            {t("continue")}
          </Button>
        </form>
      </div>
    </div>
  );
}
