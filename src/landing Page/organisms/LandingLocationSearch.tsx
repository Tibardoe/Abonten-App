"use client";

import AutoComplete, {
  type AutoCompleteHandle,
} from "@/components/molecules/AutoComplete";
import { generateSlug } from "@/utils/geerateSlug";
import { getCurrentPosition } from "@/utils/getCurrentPosition";
import { logger } from "@/utils/logger";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FiArrowRightCircle } from "react-icons/fi";

// The only genuinely interactive part of the landing page — everything
// else (hero text, nav, background) is static and lives in the Server
// Component page around this island.
export default function LandingLocationSearch() {
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
        router.push(`/explore/${generateSlug(result.rawText)}`);
        return;
      }

      if (result?.status === "error") {
        // A genuine API/service failure, not "nothing typed" — falling
        // through to the geolocation branch below would silently ignore
        // whatever the user actually typed, so this needs its own branch
        // even though it degrades the same way "unresolved" does.
        logger.error("Location service unavailable while resolving input.");
        router.push("/explore");
        return;
      }

      // Nothing was typed: try the user's current location instead.
      if (!navigator.geolocation) {
        router.push("/explore");
        return;
      }

      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      router.push(`/explore/current-location?lat=${latitude}&lng=${longitude}`);
    } catch (error) {
      logger.error("Unable to resolve location:", error);
      router.push("/explore");
    } finally {
      setIsResolvingLocation(false);
    }
  };

  return (
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
  );
}
