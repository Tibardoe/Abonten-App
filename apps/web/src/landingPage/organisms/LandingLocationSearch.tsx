"use client";

import AutoComplete, {
  type AutoCompleteHandle,
} from "@/components/molecules/AutoComplete";
import { getCurrentPosition } from "@/utils/getCurrentPosition";
import { generateSlug } from "@abonten/core/geerateSlug";
import { logger } from "@abonten/core/logger";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FiArrowRight } from "react-icons/fi";
import { IoNavigateOutline } from "react-icons/io5";

// The only genuinely interactive part of the landing page — everything
// else (hero text, nav, background) is static and lives in the Server
// Component page around this island. Also the search on the /explore area
// chooser, where it sits on the page's own background (`onDark={false}`).
export default function LandingLocationSearch({
  onDark = true,
}: {
  /** Drawn over the dark landing photo (true) or on a plain page. */
  onDark?: boolean;
}) {
  const t = useTranslations("landing");

  const router = useRouter();
  const autoCompleteRef = useRef<AutoCompleteHandle>(null);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // The visitor's own position, or the general explore page when the browser
  // can't or won't say where they are.
  const exploreFromCurrentPosition = async () => {
    if (!navigator.geolocation) {
      router.push("/explore");
      return;
    }
    const position = await getCurrentPosition();
    const { latitude, longitude } = position.coords;
    router.push(`/explore/current-location?lat=${latitude}&lng=${longitude}`);
  };

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
      await exploreFromCurrentPosition();
    } catch (error) {
      logger.error("Unable to resolve location:", error);
      router.push("/explore");
    } finally {
      setIsResolvingLocation(false);
    }
  };

  const handleUseMyLocation = async () => {
    if (isLocating) return;
    setIsLocating(true);
    try {
      await exploreFromCurrentPosition();
    } catch (error) {
      logger.error("Unable to read the current position:", error);
      router.push("/explore");
    } finally {
      setIsLocating(false);
    }
  };

  return (
    <div
      className={`flex w-full max-w-xl flex-col items-center gap-4 ${onDark ? "lg:items-start" : ""}`}
    >
      <form
        className={`flex w-full items-center gap-2 rounded-2xl p-1.5 text-lg md:text-xl ${
          onDark
            ? "bg-white/95 shadow-2xl shadow-black/30 ring-1 ring-white/20"
            : "bg-white shadow-md ring-1 ring-border"
        }`}
        onSubmit={(event) => {
          event.preventDefault();
          void handleGoClick();
        }}
      >
        <AutoComplete
          ref={autoCompleteRef}
          placeholderText={{
            text: t("enterACityOrAddress"),
            svgUrl: "assets/images/location.svg",
          }}
          address={{ address: () => {} }}
          classname="bg-transparent text-neutral-900 [&_input]:text-neutral-900 [&_input]:placeholder:text-neutral-500 [&_svg]:text-neutral-700 focus-within:ring-0"
        />

        <button
          type="submit"
          disabled={isResolvingLocation}
          aria-label={t("exploreEventsAndPlacesHere")}
          className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 md:px-5"
        >
          {isResolvingLocation ? (
            <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
          ) : (
            <FiArrowRight aria-hidden className="h-5 w-5" />
          )}
          <span className="hidden sm:inline">{t("explore")}</span>
        </button>
      </form>

      <button
        type="button"
        onClick={handleUseMyLocation}
        disabled={isLocating}
        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
          onDark
            ? "text-white/90 hover:bg-white/10 hover:text-white"
            : "text-foreground hover:bg-accent"
        }`}
      >
        {isLocating ? (
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
        ) : (
          <IoNavigateOutline aria-hidden className="h-4 w-4" />
        )}
        {t("useMyCurrentLocation")}
      </button>
    </div>
  );
}
