"use client";

import { getActiveDraftCounts } from "@/actions/getActiveDraftCounts";
import NewPlaceOrDraftChooser from "@/components/molecules/NewPlaceOrDraftChooser";
import { Button } from "@/components/ui/button";
import PlaceUploadModal from "@/places/organisms/PlaceUploadModal";
import { useState } from "react";

// "Add Place" trigger for the Places-tab empty state, analogous to
// PostButton.tsx's role on the Posts tab. Checks for saved place drafts
// before opening a fresh modal, same as PostButton.tsx does for events —
// starting a new place must not silently abandon an in-progress draft.
export default function CreatePlaceButton() {
  const [showPlaceModal, setShowPlaceModal] = useState(false);
  const [showChooser, setShowChooser] = useState(false);

  const handleClick = async () => {
    const { data } = await getActiveDraftCounts();
    if (data.place > 0) {
      setShowChooser(true);
    } else {
      setShowPlaceModal(true);
    }
  };

  return (
    <>
      <Button className="px-10 font-medium text-sm mt-5" onClick={handleClick}>
        Add Place
      </Button>

      {showChooser && (
        <NewPlaceOrDraftChooser
          onCreateNew={() => {
            setShowChooser(false);
            setShowPlaceModal(true);
          }}
          onClose={() => setShowChooser(false)}
        />
      )}

      {showPlaceModal && (
        <PlaceUploadModal handleClosePopup={setShowPlaceModal} />
      )}
    </>
  );
}
