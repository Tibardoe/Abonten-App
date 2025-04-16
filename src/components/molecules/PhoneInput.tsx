"use client";

import { useCountries } from "@/hooks/useCountries";
import Image from "next/image";
import { useState } from "react";
import { cn } from "../lib/utils";

type Props = {
  selectedCountry: string;
  onSelectCountry: (dialCode: string) => void;
  onChange: (phoneNumber: string) => void;
};

export default function PhoneInput({
  selectedCountry,
  onSelectCountry,
  onChange,
}: Props) {
  const countries = useCountries();

  const [showDropdown, setShowDropdown] = useState(false);

  const handleRotate = () => {
    setShowDropdown((prevState) => !prevState);
  };

  return (
    <div className="flex w-full gap-3 relative">
      <div className="bg-black bg-opacity-5 rounded-xl p-4 text-xl flex items-center gap-2 min-w-28">
        <span>{selectedCountry}</span>
        <button type="button" onClick={handleRotate}>
          <Image
            className={cn(
              "w-[30px] h-[30px] lg:w-[35px] lg:h-[35px]",
              showDropdown && "rotate-180",
            )}
            src="/assets/images/options.svg"
            alt="Options logo"
            width={40}
            height={40}
          />
        </button>
      </div>

      {showDropdown && (
        <div className="absolute top-12 left-0 w-full z-10 bg-white shadow-md max-h-60 overflow-y-scroll flex flex-col">
          {countries.map((country) => (
            <button
              className="p-2 hover:bg-gray-200 cursor-pointer flex items-center gap-5"
              type="button"
              key={country.name}
              onClick={() => {
                onSelectCountry(country.dialCode);
                setShowDropdown(false);
              }}
            >
              <Image
                src={country.flag}
                alt="Country flag"
                width={40}
                height={40}
              />
              {country.name} ({country.dialCode})
            </button>
          ))}
        </div>
      )}

      <div className="bg-black bg-opacity-5 rounded-xl p-4 flex-1 min-w-[28]">
        <input
          type="tel"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Phone number"
          className="bg-transparent outline-none text-xl"
        />
      </div>
    </div>
  );
}
