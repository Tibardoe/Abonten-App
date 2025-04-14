"use client";

import AutoComplete from "@/components/molecules/AutoComplete";
import AuthPopup from "@/components/organisms/AuthPopup";
import MobileAuthPopup from "@/components/organisms/MobileAuthPopup";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ButtonHTMLAttributes, useState } from "react";

export default function Landing() {
  const router = useRouter();

  const [selectedAddress, setSelectedAddress] = useState("");

  const [buttonText, setButtonText] = useState("");

  const [showAuthPopup, setShowAuthPopup] = useState(false);

  const handleClicked = () => {
    router.push(`/events?location=${selectedAddress}`);
  };

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
        <div className="flex justify-between py-5 w-[90%] md:w-[80%]">
          <div>
            <Link href="/">
              <h1 className="text-2xl md:text-4xl font-bold">Abonten</h1>
            </Link>
          </div>
          <div className="space-x-5">
            <Button
              variant="outline"
              className="bg-transparent rounded-full font-bold"
              onClick={handleClick}
            >
              Sign Up
            </Button>
            <Button
              variant="outline"
              className="bg-transparent rounded-full font-bold"
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
        <div className="w-[90%] md:w-[80%] space-y-12">
          <h1 className="font-bold text-5xl text-center lg:text-6xl lg:text-left">
            Explore, post and attend <br /> events near you
          </h1>
          <div className="flex md:w-[40%] gap-2 items-center justify-center lg:justify-start">
            <AutoComplete
              placeholderText={{
                text: "Enter your address",
                svgUrl: "assets/images/location.svg",
              }}
              address={{ address: setSelectedAddress }}
            />

            <button type="button" onClick={handleClicked}>
              <Image
                className="w-[50px] h-[50px] md:w-[70px] md:h-[70px]"
                src="/assets/images/go.svg"
                alt="Next image"
                width={50}
                height={50}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
