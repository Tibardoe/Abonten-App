import useUserLocation from "@/hooks/useUserLocation";
import Image from "next/image";
import { useEffect, useState } from "react";
import GoogleAuthButton from "../atoms/GoogleAuthButton";
import PhoneInput from "../molecules/PhoneInput";
import { Button } from "../ui/button";

type PopupProp = {
  buttonText: string;
  onClose: () => void;
};

export default function AuthPopup({ buttonText, onClose }: PopupProp) {
  const [countryCode, setCountryCode] = useState("");

  const country = useUserLocation();

  useEffect(() => {
    setCountryCode(country);
  }, [country]);

  return (
    // Overlay
    <div className="bg-black top-0 w-full h-screen z-30 absolute bg-opacity-50  justify-center items-center hidden md:flex">
      {/* Popup */}
      <div className="md:w-[60%] lg:w-[40%] bg-white text-black px-10 py-5  flex-col items-center gap-5 rounded-xl hidden md:flex">
        <button type="button" className="ml-auto" onClick={onClose}>
          <Image
            src="/assets/images/authExit.svg"
            alt="Exit logo"
            width={40}
            height={40}
            className="w-[20px] md:w-[30px] lg:w-[40px] h-[20px] md:h-[30px] lg:h-[35px]"
          />
        </button>

        <h1 className="font-bold text-5xl mb-20">Abonten</h1>

        <GoogleAuthButton buttonText={buttonText} />

        {/* Or section */}
        <div className="flex gap-2 items-center w-full">
          <span className="border border-black border-opacity-30 w-full" />
          <p className="text-xl opacity-50">Or</p>
          <span className="border border-black border-opacity-30 w-full" />
        </div>

        {/* Phone number option */}
        <PhoneInput
          selectedCountry={countryCode}
          onSelectCountry={setCountryCode}
        />

        <Button className="w-full rounded-full text-xl font-bold py-10 mt-20">
          Continue
        </Button>
      </div>
    </div>
  );
}
