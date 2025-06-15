"use client";

import AutoComplete from "@/components/molecules/AutoComplete";
import AuthPopup from "@/components/organisms/AuthPopup";
import MobileAuthPopup from "@/components/organisms/MobileAuthPopup";
import { Button } from "@/components/ui/button";
import { generateSlug } from "@/utils/geerateSlug";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { FiArrowRightCircle } from "react-icons/fi";

export default function Landing() {
  const [selectedAddress, setSelectedAddress] = useState("");

  const [buttonText, setButtonText] = useState("");

  const [showAuthPopup, setShowAuthPopup] = useState(false);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const text = (event.target as HTMLButtonElement).innerText;
    setButtonText(text);

    setShowAuthPopup((prevState) => !prevState);
  };

  return (
    <div className="bg-landing bg-repeat bg-cover bg-bottom w-full h-dvh relative text-white flex flex-col items-center">
      {showAuthPopup && (
        <>
          <AuthPopup
            buttonText={buttonText}
            onClose={() => setShowAuthPopup(false)}
          />
          <MobileAuthPopup
            buttonText={buttonText}
            onClose={() => setShowAuthPopup(false)}
          />
        </>
      )}

      {/* Header */}
      <nav className="w-full bg-black bg-opacity-30 flex justify-center z-10">
        <div className="flex justify-between py-5 w-[90%]">
          <div>
            <Link href="/">
              <h1 className="text-2xl md:text-4xl font-bold">Abonten</h1>
            </Link>
          </div>
          <div className="space-x-3">
            <Button
              variant="outline"
              className="bg-transparent rounded-md font-bold"
              onClick={handleClick}
            >
              Sign Up
            </Button>
            <Button
              variant="outline"
              className="bg-transparent rounded-md font-bold"
              onClick={handleClick}
            >
              Sign In
            </Button>
          </div>
        </div>
      </nav>

      {/* overlay */}
      <div className="absolute flex justify-center items-center w-full h-dvh bg-black bg-opacity-30">
        {/* Hero */}
        <div className="w-[90%] space-y-12">
          <h1 className="font-bold text-5xl text-center lg:text-6xl lg:text-left">
            Explore, post and attend <br /> events near you
          </h1>
          <div className="flex md:w-[40%] gap-2 items-center justify-center lg:justify-start text-lg md:text-xl">
            <AutoComplete
              placeholderText={{
                text: "Enter your address",
                svgUrl: "assets/images/location.svg",
              }}
              address={{ address: setSelectedAddress }}
            />

            <Link href={`/events/location/${generateSlug(selectedAddress)}`}>
              <FiArrowRightCircle className="text-5xl" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
