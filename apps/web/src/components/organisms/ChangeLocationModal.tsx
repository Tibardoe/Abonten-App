"use client";

import ModalShell from "@/components/atoms/ModalShell";
import { useMarketContext } from "@/hooks/useMarketContext";
import { getCurrentPosition } from "@/utils/getCurrentPosition";
import { generateSlug } from "@abonten/core/geerateSlug";
import { logger } from "@abonten/core/logger";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import MaskIcon from "../atoms/MaskIcon";
import AutoComplete, {
  type AutoCompleteHandle,
} from "../molecules/AutoComplete";

type ChangeLocationModalProp = {
  handleShowChangeLocationModal: (state: boolean) => void;
};

// Dynamically import the MapModal (so it doesn't SSR)
const MapModal = dynamic(() => import("@/components/organisms/MapModal"), {
  ssr: false,
});

export default function ChangeLocationModal({
  handleShowChangeLocationModal,
}: ChangeLocationModalProp) {
  const t = useTranslations("common");

  const router = useRouter();
  const autoCompleteRef = useRef<AutoCompleteHandle>(null);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [isMapOpen, setIsMapOpen] = useState(false);

  const [_selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);

  // The map starts on the visitor's position when they open it and allow
  // it, else on the centre of the market they're browsing — it no longer
  // asks for the position as soon as this modal opens, and no longer falls
  // back to Nairobi.
  const { market } = useMarketContext();
  const handleOpenMap = () => {
    const fallback = market?.centre ?? { lat: 5.6037, lng: -0.187 };
    getCurrentPosition()
      .then((pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      })
      .catch(() => {
        setCoords(fallback);
      })
      .finally(() => setIsMapOpen(true));
  };

  const handleLocationSelect = (location: {
    lat: number;
    lng: number;
    address: string;
  }) => {
    setSelectedLocation(location); // Save the result from modal
    setIsMapOpen(false); // Close modal
  };

  // Mirrors LandingLocationSearch.tsx's "Go" handler exactly: resolves
  // whatever is currently typed -- even if the user never picked a dropdown
  // suggestion -- through the same predictions lookup, with a raw-text-slug
  // fallback, so typing alone is enough to set a location here too.
  const handleSetClick = async () => {
    if (isResolvingLocation) return;

    setIsResolvingLocation(true);
    try {
      const result = await autoCompleteRef.current?.resolveTypedInput();

      if (result?.status === "resolved") {
        // AutoComplete already navigated to the resolved location.
        handleShowChangeLocationModal(false);
        return;
      }

      if (result?.status === "unresolved") {
        router.push(`/explore/${generateSlug(result.rawText)}`);
        handleShowChangeLocationModal(false);
        return;
      }

      if (!navigator.geolocation) {
        router.push("/explore");
        handleShowChangeLocationModal(false);
        return;
      }

      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      router.push(`/explore/current-location?lat=${latitude}&lng=${longitude}`);
      handleShowChangeLocationModal(false);
    } catch (error) {
      logger.error("Unable to resolve location:", error);
    } finally {
      setIsResolvingLocation(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={() => handleShowChangeLocationModal(false)}
      title={t("setYourLocation")}
    >
      <div className="w-full h-full bg-card text-card-foreground md:w-[60%] md:h-[80%] lg:w-[40%] md:rounded-xl p-5 space-y-10">
        <div className="flex justify-between">
          <h1 className="text-2xl font-bold mx-auto">{t("setYourLocation")}</h1>

          <button
            type="button"
            onClick={() => handleShowChangeLocationModal(false)}
          >
            <MaskIcon
              src="/assets/images/circularCancel.svg"
              alt={t("cancel")}
              className="w-[30px] h-[30px] bg-foreground"
            />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* items-stretch (+ no fixed heights) lets the Set button take its
              height from the autocomplete field, so the two stay aligned at
              every breakpoint and regardless of font size. */}
          <div className="flex items-stretch gap-2">
            <AutoComplete
              ref={autoCompleteRef}
              placeholderText={{
                text: t("enterYourAddress"),
                svgUrl: "/assets/images/search.svg",
              }}
              classname="bg-muted"
              address={{ address: () => {} }}
            />

            <button
              type="button"
              onClick={handleSetClick}
              disabled={isResolvingLocation}
              className="grid w-20 shrink-0 place-items-center rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-60 md:w-24"
            >
              {isResolvingLocation ? "..." : t("set")}
            </button>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              className="flex items-center gap-2 font-bold"
              onClick={handleOpenMap}
            >
              <MaskIcon
                src="/assets/images/onMap.svg"
                alt={t("chooseOnMap")}
                className="w-[30px] h-[30px]"
              />
              {t("chooseOnMap")}
            </button>

            <hr className="border-border" />
          </div>
        </div>
      </div>

      {/* 🧭 Modal Map Picker */}
      {coords && (
        <MapModal
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          defaultCenter={coords}
          onLocationSelect={handleLocationSelect}
        />
      )}
    </ModalShell>
  );
}
