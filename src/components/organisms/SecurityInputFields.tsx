"use client";

import deleteUser from "@/actions/deleteUser";
import sendOtpForPhoneUpdate from "@/actions/sendOtpForPhoneUpdate";
// import updateUserPhoneNumber from "@/actions/updateUserPhoneNumber";
import verifyPhoneUpdateOtp from "@/actions/verifyOtpAndUpdatePhone";
import useUserLocation from "@/hooks/useUserLocation";
import { phoneNumberFormatter } from "@/utils/phoneNumberFormatter";
import Image from "next/image";
// import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import Input from "../atoms/Input";
import Notification from "../atoms/Notification";
import PhoneInput from "../molecules/PhoneInput";
import { Button } from "../ui/button";

export default function SecurityInputFields() {
  const [notification, setNotification] = useState<string | null>(null);

  const [step, setStep] = useState(1);

  const form = useForm();

  const { register } = form;

  const increaseStep = () => {
    setStep((prevStep) => prevStep + 1);
  };

  const decreaseStep = () => {
    setStep((prevStep) => prevStep - 1);
  };

  const handleDeleteUser = async () => {
    const response = await deleteUser();

    if (response.status !== 200) {
      setNotification(response.message);
      return;
    }

    setNotification(response.message);
  };

  // From auth popup
  const country = useUserLocation();

  // const location = getUserLocation();

  const [countryCode, setCountryCode] = useState("");

  const [phone, setPhone] = useState("");

  const [otp, setOtp] = useState("");

  const [otpArray, setOtpArray] = useState(["", "", "", "", "", ""]);

  const [otpErrorMessageShown, setOtpErrorMessageShown] = useState(false);

  // const router = useRouter();

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
      const formattedPhone = phoneNumberFormatter(phone);
      setPhone(formattedPhone);
      await sendOtpForPhoneUpdate(`${countryCode}${formattedPhone}`);

      setStep((prevStep) => prevStep + 1);
    } catch (error) {
      console.error("Phone Sign-In Error:", error);
    }
  };

  const handleOtpsubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      const response = await verifyPhoneUpdateOtp(fullPhoneNumber, otp);

      if (response?.status !== 200 && response?.message) {
        setNotification(response.message);
      }

      if (response?.status === 200 && response?.message) {
        setNotification(response.message);
        setStep(1);
      }
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

  return (
    <>
      {step === 1 && (
        <form className="flex flex-col gap-5">
          <div className="space-y-2">
            <span className="font-bold md:text-lg">Phone</span>

            <div className="w-full flex justify-between items-center gap-5 p-3 rounded-md border border-black border-opacity-30">
              <span className="opacity-50">Eg. +233 24 000 0000</span>

              <button type="button" onClick={increaseStep}>
                Edit
              </button>
            </div>
          </div>

          <Input
            title="Email"
            inputPlaceholder="Email"
            {...register("email")}
          />

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={handleDeleteUser}
              className="text-red-700 flex items-center gap-1 font-bold md:text-lg"
            >
              <Image
                src="/assets/images/delete.svg"
                alt="Delete icon"
                width={40}
                height={40}
                className="w-6 h-6 md:w-8 md:h-8"
              />
              Delete account
            </button>

            <Button className="self-end font-bold">Update</Button>
          </div>
        </form>
      )}

      {step === 2 && (
        // Popup
        <div className="md:w-[70%] mx-auto bg-white text-black p-5 flex-col items-center gap-5 rounded-lg flex">
          <div className="mb-5">
            <h1 className="font-bold text-3xl">Update phone number</h1>

            <p className="text-sm text-gray-500">
              We&apos;ll send an SMS code for verification
            </p>
          </div>

          <form onSubmit={handlePhoneSubmit} className="w-full space-y-10">
            {/* Phone number option */}
            <PhoneInput
              selectedCountry={countryCode}
              onSelectCountry={setCountryCode}
              onChange={handleChange}
            />

            <div className="flex items-center gap-1">
              <Button
                className="w-full rounded-md md:text-lg font-bold py-6"
                onClick={decreaseStep}
              >
                Back
              </Button>

              <Button
                className="w-full rounded-md md:text-lg font-bold py-6"
                type="submit"
              >
                Continue
              </Button>
            </div>
          </form>
        </div>
      )}

      {/*   Otp popup */}
      {step === 3 && (
        <div className="w-full md:w-[80%] mx-auto bg-white text-black px-10 py-5 flex-col items-center gap-5 rounded-xl flex">
          <div className="flex flex-col items-center">
            <h1 className="font-bold text-3xl">Enter Code</h1>

            <p>
              We&apos;ve sent it to <br /> {fullPhoneNumber}
            </p>
          </div>

          <form onSubmit={handleOtpsubmit} className="space-y-5">
            {/* Code input */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex gap-2" onPaste={handlePaste}>
                {otpArray.map((digit, index) => (
                  <div
                    key={index.toString()}
                    className="w-12 h-12 text-2xl text-center border rounded-md focus:ring-2 ring-black"
                    // className="w-12 h-12 md:w-[70px] md:h-[60px] flex justify-center items-center rounded-xl bg-black bg-opacity-10 text-xl"
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
                <p className="text-red-700 md:text-lg self-start">
                  Verfication code incorrect!
                </p>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Button
                className="w-full rounded-md md:text-lg font-bold py-6"
                onClick={decreaseStep}
              >
                Edit number
              </Button>

              <Button className="w-full rounded-md md:text-lg font-bold py-6">
                Continue
              </Button>
            </div>
          </form>
        </div>
      )}

      <Notification notification={notification} />
    </>
  );
}
