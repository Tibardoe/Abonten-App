"use client";

import Image from "next/image";
import Link from "next/link";
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

  const [selectedAddress, setSelectedAddress] = useState("");

  const handleConfirm = () => {
    if (currentLocation) {
      onLocationSelect(currentLocation);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white md:rounded-xl w-full h-full md:w-[60%] md:h-[80%] lg:w-[40%] relative shadow-lg space-y-4">
        <MapPicker
          defaultCenter={defaultCenter}
          onLocationSelect={handleMapChange}
          center={currentLocation || defaultCenter}
        />

        <div className="p-4 space-y-2">
          <h2 className="text-lg font-semibold">Set your location</h2>
          <div>
            {/* <input
              type="text"
              readOnly
              value={currentLocation?.address || ""}
              className="w-full border border-gray-300 rounded px-3 py-2"
            /> */}

            <AutoComplete
              placeholderText={{
                text: "Enter your address",
                svgUrl: "/assets/images/search.svg",
              }}
              classname="bg-black bg-opacity-5"
              address={{ address: setSelectedAddress }}
              value={currentLocation?.address}
              onSelectCoordinates={(loc) => {
                setCurrentLocation(loc); // updates marker location
              }}
            />

            <p className="text-gray-400">
              Move the pin to your preferred location
            </p>
          </div>
        </div>

        {/* Set address button */}
        <div className="flex mt-10 px-4">
          <Link
            href={`/events/${currentLocation?.address}`}
            type="button"
            onClick={handleConfirm}
            className="bg-black w-full rounded-full text-white font-bold px-4 py-2 text-center"
          >
            Set address
          </Link>
        </div>

        {/* Cancel button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-1 right-3 text-3xl"
        >
          <MdCancel />
        </button>
      </div>
    </div>
  );
};

export default MapModal;
