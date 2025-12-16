"use client";

import { useCountries } from "@/hooks/useCountries";
import Image from "next/image";
import { useState } from "react";
import { IoIosArrowDown } from "react-icons/io";

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
    <div className="flex w-full gap-2 relative">
      <div className="bg-black bg-opacity-5 rounded-md p-2 flex items-center justify-center gap-1 md:gap-2 md:min-w-28 border">
        <span>{selectedCountry}</span>

        <button type="button" onClick={handleRotate}>
          <IoIosArrowDown className="text-iconGray text-xl" />
        </button>
      </div>

      {showDropdown && (
        <div className="absolute top-12 left-0 w-full z-10 bg-white shadow-md max-h-60 overflow-y-scroll flex flex-col">
          {countries.map((country) => (
            <button
              className="px-2 hover:bg-gray-200 cursor-pointer flex items-center gap-5"
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

      <div className="bg-black bg-opacity-5 rounded-md px-2 flex-1 flex items-center border">
        <input
          type="tel"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Phone number"
          className="bg-transparent outline-none"
        />
      </div>
    </div>
  );
}
