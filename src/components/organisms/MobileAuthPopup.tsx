import useUserLocation, { getUserLocation } from "@/hooks/useUserLocation";
import { signInWithPhone, verifyOtp } from "@/services/authService";
import { phoneNumberFormatter } from "@/utils/phoneNumberFormatter";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import GoogleAuthButton from "../atoms/GoogleAuthButton";
import PhoneInput from "../molecules/PhoneInput";
import { Button } from "../ui/button";

type PopupProp = {
  buttonText: string;
  onClose: () => void;
};

export default function MobileAuthPopup({ buttonText, onClose }: PopupProp) {
  const country = useUserLocation();

  const location = getUserLocation();

  const [countryCode, setCountryCode] = useState("");

  const [phone, setPhone] = useState("");

  const [otp, setOtp] = useState("");

  const [step, setStep] = useState(1);

  const [otpArray, setOtpArray] = useState(["", "", "", "", "", ""]);

  const [otpErrorMessageShown, setOtpErrorMessageShown] = useState(false);

  const router = useRouter();

  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const setInputRef = (el: HTMLInputElement | null, index: number) => {
    inputRefs.current[index] = el;
  };

  const fullPhoneNumber = `${countryCode}${phone}`;

  useEffect(() => {
    if (country) {
      setCountryCode(country);
    }
  }, [country]);

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
      await verifyOtp(fullPhoneNumber, otp);
      router.push("/events");
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
    <div className="w-full py-10 flex flex-col md:hidden bg-white top-0 h-screen z-30 absolute items-center">
      <div className="w-[90%] text-black h-screen relative">
        <button type="button" className="ml-auto mb-10" onClick={onClose}>
          <Image
            src="/assets/images/cancel.svg"
            alt="Exit logo"
            width={40}
            height={40}
            className="w-[20px] md:w-[30px] lg:w-[40px] h-[20px] md:h-[30px] lg:h-[35px]"
          />
        </button>

        <h1 className="font-bold text-5xl mb-20 text-black text-center">
          Abonten
        </h1>

        <div className="space-y-5">
          <GoogleAuthButton buttonText={buttonText} location={location} />

          {/* Or section */}
          <div className="flex gap-2 items-center w-full">
            <span className="border border-black border-opacity-30 w-full" />
            <p className="text-xl opacity-50">Or</p>
            <span className="border border-black border-opacity-30 w-full" />
          </div>

          <form onSubmit={handlePhoneSubmit} className="w-full">
            {/* Phone number option */}
            <PhoneInput
              selectedCountry={countryCode}
              onSelectCountry={setCountryCode}
              onChange={handleChange}
            />

            <Button className="w-full rounded-full text-xl font-bold py-10 absolute bottom-0">
              Continue
            </Button>
          </form>
        </div>
      </div>
    </div>
  ) : (
    <div className="w-full py-10 flex flex-col md:hidden bg-white top-0 h-screen z-30 absolute items-center">
      <div className="w-[90%] text-black h-full relative flex flex-col items-center">
        <button type="button" className="mr-auto mb-10" onClick={onClose}>
          <Image
            src="/assets/images/cancel.svg"
            alt="Exit logo"
            width={40}
            height={40}
            className="w-[20px] md:w-[30px] lg:w-[40px] h-[20px] md:h-[30px] lg:h-[35px]"
          />
        </button>

        <h1 className="font-bold text-4xl mb-2 text-black">Enter Code</h1>

        <div className="text-opacity-50 text-lg mb-20">
          <p>
            We've sent it to <br /> {fullPhoneNumber}
          </p>
        </div>

        <form onSubmit={handleOtpsubmit} className="w-full">
          <div className="flex flex-col gap-3 items-center">
            <div className="flex gap-3 w-full" onPaste={handlePaste}>
              {otpArray.map((digit, index) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                  key={index}
                  className="w-[70px] h-[60px] flex justify-center items-center rounded-2xl bg-black bg-opacity-10 text-xl"
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
              <p className="text-red-700 text-lg">
                Verfication code incorrect!
              </p>
            )}
          </div>

          <Button className="w-full rounded-full text-xl font-bold py-10 absolute bottom-0">
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
