"use client";

import ModalShell from "@/components/atoms/ModalShell";
import { useTranslations } from "next-intl";
// import Image from "next/image";
import type React from "react";
import { useState } from "react";
import { MdCancel } from "react-icons/md";
import AutoComplete from "../molecules/AutoComplete";
import MapPicker from "./MapPicker";

interface MapModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCenter: { lat: number; lng: number };
  onLocationSelect: (location: {
    lat: number;
    lng: number;
    address: string;
  }) => void;
}

const MapModal: React.FC<MapModalProps> = ({
  isOpen,
  onClose,
  defaultCenter,
  onLocationSelect,
}) => {
  const t = useTranslations("common");

  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);

  const handleMapChange = (location: {
    lat: number;
    lng: number;
    address: string;
  }) => {
    setCurrentLocation(location); // update local input value
  };

  const [_selectedAddress, setSelectedAddress] = useState("");

  const handleConfirm = () => {
    if (currentLocation) {
      onLocationSelect(currentLocation);
      onClose();
    }
  };

  return (
    <ModalShell open={isOpen} onClose={onClose} title={t("setYourLocation")}>
      <div className="bg-card text-card-foreground md:rounded-xl w-full h-full md:w-[60%] md:h-[80%] lg:w-[40%] relative shadow-lg space-y-4">
        <MapPicker
          defaultCenter={defaultCenter}
          onLocationSelect={handleMapChange}
          center={currentLocation || defaultCenter}
        />

        <div className="p-4 space-y-2">
          <h2 className="text-lg font-semibold">{t("setYourLocation")}</h2>
          <div>
            {/* <input
              type="text"
              readOnly
              value={currentLocation?.address || ""}
              className="w-full border border-gray-300 rounded px-3 py-2"
            /> */}

            <AutoComplete
              placeholderText={{
                text: t("enterYourAddress"),
                svgUrl: "/assets/images/search.svg",
              }}
              classname="bg-muted"
              address={{ address: setSelectedAddress }}
              value={currentLocation?.address}
              onSelectCoordinates={(loc) => {
                setCurrentLocation(loc); // updates marker location
              }}
            />

            <p className="text-muted-foreground">
              {t("moveThePinToYourPreferred")}
            </p>
          </div>
        </div>

        {/* Set address button: the parent opens Explore for the point. */}
        <div className="flex mt-10 px-4">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!currentLocation}
            className="bg-primary w-full rounded-full text-primary-foreground font-bold px-4 py-2 text-center disabled:opacity-60"
          >
            {t("setAddress")}
          </button>
        </div>

        {/* Cancel button */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("cancel")}
          className="absolute top-1 right-3 text-3xl"
        >
          <MdCancel aria-hidden />
        </button>
      </div>
    </ModalShell>
  );
};

export default MapModal;
