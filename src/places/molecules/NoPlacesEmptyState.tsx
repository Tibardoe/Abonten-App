"use client";

import ChangeLocationModal from "@/components/organisms/ChangeLocationModal";
import { useState } from "react";

// "All Places" empty state for the Explore page's Places tab (spec: "No
// places found in this location." + a "Change location" action). Owns its
// own modal state the same way
// src/components/organisms/LocationAndFilterSection.tsx does, rather than
// threading a shared open/close handler down through InfiniteList's
// emptyState prop.
export default function NoPlacesEmptyState() {
  const [showChangeLocationModal, setShowChangeLocationModal] = useState(false);

  const handleShowChangeLocationModal = (state: boolean) => {
    setShowChangeLocationModal(state);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] py-10 px-4 text-center gap-3">
      {showChangeLocationModal && (
        <ChangeLocationModal
          handleShowChangeLocationModal={handleShowChangeLocationModal}
        />
      )}

      <p className="text-muted-foreground">No places found in this location.</p>

      <button
        type="button"
        onClick={() => setShowChangeLocationModal(true)}
        className="text-sm font-semibold text-primary underline"
      >
        Change location
      </button>
    </div>
  );
}
