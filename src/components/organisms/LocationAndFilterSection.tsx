"use client";

import { undoSlug } from "@/utils/geerateSlug";
// import Image from "next/image";
import { useParams } from "next/navigation";
import { useState } from "react";
import { IoLocationOutline } from "react-icons/io5";
import FilterSearchBar from "../molecules/FilterSearchBar";
import ChangeLocationModal from "./ChangeLocationModal";

export default function LocationAndFilterSection() {
  const params = useParams();
  const locationParam = params?.location;

  const [showChangeLocationModal, setShowChangeLocationModal] = useState(false);

  const handleShowChangeLocationModal = (state: boolean) => {
    setShowChangeLocationModal(state);
  };

  const location =
    typeof locationParam === "string"
      ? undoSlug(locationParam)
      : "Unknown Location"; // fallback if undefined or not a string

  return (
    <>
      {showChangeLocationModal && (
        <ChangeLocationModal
          handleShowChangeLocationModal={handleShowChangeLocationModal}
        />
      )}

      <div className="flex flex-col gap-3 md:flex-row md:justify-between md:items-center">
        <button
          type="button"
          className="flex gap-3 items-center text-lg md:text-xl"
          onClick={() => handleShowChangeLocationModal(true)}
        >
          <IoLocationOutline className="text-3xl md:text-4xl lg:text-4xl" />

          <p>{location}</p>
        </button>
        <FilterSearchBar />
      </div>
    </>
  );
}
