"use client";

import AutoComplete, {
  type AutoCompleteHandle,
} from "@/components/molecules/AutoComplete";
import { generateSlug } from "@/utils/geerateSlug";
import { getCurrentPosition } from "@/utils/getCurrentPosition";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FiArrowRightCircle } from "react-icons/fi";

export default function Landing() {
  const t = useTranslations("navigation");
  const router = useRouter();
  const autoCompleteRef = useRef<AutoCompleteHandle>(null);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);

  const handleGoClick = async () => {
    if (isResolvingLocation) return;

    setIsResolvingLocation(true);
    try {
      const result = await autoCompleteRef.current?.resolveTypedInput();

      if (result?.status === "resolved") {
        // AutoComplete already navigated to the resolved location.
        return;
      }

      if (result?.status === "unresolved") {
        // Google Places found no match for the typed text — fall back to
        // using it as a raw slug rather than doing nothing.
        router.push(`/events/location/${generateSlug(result.rawText)}`);
        return;
      }

      // Nothing was typed: try the user's current location instead.
      if (!navigator.geolocation) {
        router.push("/events");
        return;
      }

      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      router.push(
        `/events/location/current-location?lat=${latitude}&lng=${longitude}`,
      );
    } catch (error) {
      console.error("Unable to resolve location:", error);
      router.push("/events");
    } finally {
      setIsResolvingLocation(false);
    }
  };

  return (
    <div className="bg-landing bg-repeat bg-cover bg-bottom w-full h-dvh relative text-white flex flex-col items-center">
      {/* Header */}
      <nav className="fixed w-full bg-black bg-opacity-30 flex justify-center z-10">
        <div className="flex justify-between items-center py-5 w-[90%]">
          <Link href="/" className="w-12 h-12 md:w-16 md:h-16">
            <Image
              src="/assets/images/abonten-logo-white.svg"
              alt="Abonten Logo White"
              width={100}
              height={100}
              className="object-contain"
            />
          </Link>

          <div className="space-x-3">
            <Link
              href="/auth/signin"
              className="bg-transparent rounded-md font-bold hover:bg-mint border border-mint p-2 text-sm"
            >
              {t("signUp")}
            </Link>
            <Link
              href="/auth/signin"
              className="bg-transparent rounded-md font-bold hover:bg-mint border border-mint p-2 text-sm"
            >
              {t("signIn")}
            </Link>
          </div>
        </div>
      </nav>

      {/* overlay */}
      <div className="absolute flex justify-center items-center w-full h-dvh bg-black bg-opacity-30">
        {/* Hero */}
        <div className="w-[90%] space-y-12">
          <h1 className="font-bold text-4xl text-center lg:text-6xl lg:text-left">
            Connecting people to <br /> experiences
          </h1>
          <div className="flex md:w-[40%] gap-2 items-center justify-center lg:justify-start text-lg md:text-xl">
            <AutoComplete
              ref={autoCompleteRef}
              placeholderText={{
                text: "Enter your address",
                svgUrl: "assets/images/location.svg",
              }}
              address={{ address: () => {} }}
            />

            <button
              type="button"
              onClick={handleGoClick}
              disabled={isResolvingLocation}
              aria-label="Search events by location"
              className="disabled:opacity-50"
            >
              {isResolvingLocation ? (
                <Loader2 className="text-5xl text-mint animate-spin" />
              ) : (
                <FiArrowRightCircle className="text-5xl text-mint" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
