"use client";

import ModalShell from "@/components/atoms/ModalShell";
import { generateSlug } from "@/utils/geerateSlug";
import { getCurrentPosition } from "@/utils/getCurrentPosition";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

  // Get user's current coordinates on mount
  useEffect(() => {
    getCurrentPosition()
      .then((pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      })
      .catch(() => {
        setCoords({ lat: -1.286389, lng: 36.817223 }); // Fallback to Nairobi
      });
  }, []);

  const handleOpenMap = () => {
    setIsMapOpen(true);
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
      console.error("Unable to resolve location:", error);
    } finally {
      setIsResolvingLocation(false);
    }
  };

  return (
    <ModalShell
      open
      onClose={() => handleShowChangeLocationModal(false)}
      title="Set your location"
    >
      <div className="w-full h-full bg-card text-card-foreground md:w-[60%] md:h-[80%] lg:w-[40%] md:rounded-xl p-5 space-y-10">
        <div className="flex justify-between">
          <h1 className="text-2xl font-bold mx-auto">Set your location</h1>

          <button
            type="button"
            onClick={() => handleShowChangeLocationModal(false)}
          >
            <MaskIcon
              src="/assets/images/circularCancel.svg"
              alt="Cancel"
              className="w-[30px] h-[30px] bg-foreground"
            />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex gap-2 items-center">
            <AutoComplete
              ref={autoCompleteRef}
              placeholderText={{
                text: "Enter your address",
                svgUrl: "/assets/images/search.svg",
              }}
              classname="bg-muted"
              address={{ address: () => {} }}
            />

            <button
              type="button"
              onClick={handleSetClick}
              disabled={isResolvingLocation}
              className="bg-primary rounded-lg p-3 md:p-5 w-24 h-full text-primary-foreground grid place-items-center font-bold disabled:opacity-60"
            >
              {isResolvingLocation ? "..." : "Set"}
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
                alt="Choose on map"
                className="w-[30px] h-[30px]"
              />
              Choose on map
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
