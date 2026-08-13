"use client";

import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { generateSlug } from "@/utils/geerateSlug";
import { getCurrentPosition } from "@/utils/getCurrentPosition";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import MaskIcon from "../atoms/MaskIcon";
import AutoComplete from "../molecules/AutoComplete";

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
  useBodyScrollLock(true);

  const [selectedAddress, setSelectedAddress] = useState("");

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

  return (
    <div className="fixed top-0 left-0 w-full h-dvh bg-overlay/50 flex justify-center items-center z-30">
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
              placeholderText={{
                text: "Enter your address",
                svgUrl: "/assets/images/search.svg",
              }}
              classname="bg-muted"
              address={{ address: setSelectedAddress }}
            />

            {selectedAddress !== "" && (
              <Link
                className="bg-primary rounded-lg p-3 md:p-5 w-24 h-full text-primary-foreground grid place-items-center font-bold"
                href={`/events/${generateSlug(selectedAddress)}`}
              >
                Set
              </Link>
            )}
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
    </div>
  );
}
