"use client";

import { undoSlug } from "@abonten/core/geerateSlug";
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

      {/* Search moved to the dedicated /search route (Phase 2); the
          discovery pages keep only the location switcher + a Filters
          button (FilterSearchBar in filter-only mode). */}
      <div className="flex flex-row items-center justify-between gap-3">
        <button
          type="button"
          className="flex gap-1 items-center text-lg md:text-xl"
          onClick={() => handleShowChangeLocationModal(true)}
        >
          <IoLocationOutline className="text-2xl md:text-3xl" />

          <p>{location}</p>
        </button>
        <FilterSearchBar filterOnly />
      </div>
    </>
  );
}
