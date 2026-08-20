"use client";

import { Button } from "@/components/ui/button";
import PlaceUploadModal from "@/places/organisms/PlaceUploadModal";
import { useState } from "react";

// "Add Place" trigger for the Places-tab empty state, analogous to
// PostButton.tsx's role on the Posts tab. Simpler than PostButton: Places
// has no pre-modal flyer-first picker -- the cover photo is chosen inside
// PlaceUploadModal's own Photos step (see EventUploadButton.tsx's comment).
export default function CreatePlaceButton() {
  const [showPlaceModal, setShowPlaceModal] = useState(false);

  return (
    <>
      <Button
        className="px-10 font-medium text-sm mt-5"
        onClick={() => setShowPlaceModal(true)}
      >
        Add Place
      </Button>

      {showPlaceModal && (
        <PlaceUploadModal handleClosePopup={setShowPlaceModal} />
      )}
    </>
  );
}
