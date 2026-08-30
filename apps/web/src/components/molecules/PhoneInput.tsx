"use client";

import { countryDetails } from "@/data/countryDetails";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useRef, useState } from "react";
import { IoIosArrowDown } from "react-icons/io";

type Props = {
  selectedCountry: string;
  onSelectCountry: (dialCode: string) => void;
  onChange: (phoneNumber: string) => void;
};

// Country list is the same small curated set used for currency handling
// (src/data/countryDetails.ts) rather than a live restcountries.com fetch --
// that API's v3.1 endpoint (the version this app previously called) has been
// deprecated by its provider and now returns an error for every request, so
// useCountries()/fetchCountries() always resolved to an empty list and this
// dropdown opened onto nothing. A static list also means no external image
// host is needed for flags -- emoji render natively.
export default function PhoneInput({
  selectedCountry,
  onSelectCountry,
  onChange,
}: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside([containerRef], () => setShowDropdown(false));

  return (
    <div ref={containerRef} className="flex w-full gap-2 relative">
      <div className="bg-muted rounded-md p-2 flex items-center justify-center gap-1 md:gap-2 md:min-w-28 border border-input ring-1 ring-transparent transition-shadow focus-within:ring-ring">
        <span>{selectedCountry}</span>

        <button
          type="button"
          onClick={() => setShowDropdown((prev) => !prev)}
          className="focus-visible:outline-none"
          aria-label="Country code"
          aria-haspopup="true"
          aria-expanded={showDropdown}
        >
          <IoIosArrowDown className="text-muted-foreground text-xl" />
        </button>
      </div>

      {showDropdown && (
        <div className="absolute top-12 left-0 w-full z-10 bg-popover text-popover-foreground shadow-md max-h-60 overflow-y-scroll flex flex-col rounded-md border border-border">
          {countryDetails.map((country) => (
            <button
              aria-current={country.callingCode === selectedCountry}
              className="px-3 py-2 hover:bg-accent cursor-pointer flex items-center gap-3 text-left"
              type="button"
              key={country.countryCode}
              onClick={() => {
                onSelectCountry(country.callingCode);
                setShowDropdown(false);
              }}
            >
              <span className="text-xl" aria-hidden>
                {country.flag}
              </span>
              {country.name} ({country.callingCode})
            </button>
          ))}
        </div>
      )}

      <div className="bg-muted rounded-md px-2 flex-1 flex items-center border border-input ring-1 ring-transparent transition-shadow focus-within:ring-ring">
        <input
          type="tel"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Phone number"
          aria-label="Phone number"
          className="w-full bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
      </div>
    </div>
  );
}
