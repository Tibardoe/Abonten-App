import Image from "next/image";
import { useState } from "react";
import GoogleAuthButton from "../atoms/GoogleAuthButton";
import PhoneInput from "../molecules/PhoneInput";
import { Button } from "../ui/button";

type PopupProp = {
  buttonText: string;
  onClose: () => void;
};

export default function MobileAuthPopup({ buttonText, onClose }: PopupProp) {
  const [countryCode, setCountryCode] = useState("");

  return (
    <div className="w-full py-10 flex flex-col md:hidden bg-white top-0 h-screen z-30 absolute items-center">
      <div className="w-[90%] text-black h-full relative">
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
          <GoogleAuthButton buttonText={buttonText} />

          {/* Or section */}
          <div className="flex gap-2 items-center w-full">
            <span className="border border-black border-opacity-30 w-full" />
            <p className="text-xl opacity-50">Or</p>
            <span className="border border-black border-opacity-30 w-full" />
          </div>

          {/* Phone number input */}
          <PhoneInput
            selectedCountry={countryCode}
            onSelectCountry={setCountryCode}
          />

          <Button className="w-full rounded-full text-xl font-bold py-10 absolute bottom-0">
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
