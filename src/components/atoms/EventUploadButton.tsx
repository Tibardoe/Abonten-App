"use client";

import { useImageSelection } from "@/hooks/useImageSelection";
import { useToast } from "@/hooks/useToast";
import CreateMenu from "@/places/molecules/CreateMenu";
import PlaceUploadModal from "@/places/organisms/PlaceUploadModal";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@/utils/uploadLimits";
import { useState } from "react";
import EventUploadModal from "../organisms/EventUploadModal";

// Desktop nav-link trigger for creating an Event or a Place (rendered only
// inside the desktop header). "Create" replaces the old single-purpose
// "Post" button now that there are two things to create — selecting Event
// keeps this file's existing flyer-first flow untouched; selecting Place
// opens PlaceUploadModal directly, since a place's cover photo is picked
// inside that modal's own Photos step, not before it.
export default function EventUploadButton() {
  const [showPopup, setShowPopup] = useState(false);
  const [showPlaceModal, setShowPlaceModal] = useState(false);
  const toast = useToast();

  const {
    imagePreview,
    selectedFile,
    fileInputRef,
    openFilePicker,
    handleFileChange,
  } = useImageSelection({
    invalidFileMessage: "Please select an image file for your event flyer.",
    maxSizeBytes: MAX_EVENT_FLYER_SIZE_BYTES,
    onInvalidFile: (message) => toast.error(message),
    onSelect: () => setShowPopup(true),
  });

  const closePopup = (state: boolean) => setShowPopup(state);
  const closePlaceModal = (state: boolean) => setShowPlaceModal(state);

  return (
    <>
      {showPopup && imagePreview && selectedFile && (
        <EventUploadModal
          handleClosePopup={closePopup}
          imgUrl={imagePreview}
          selectedFile={selectedFile}
        />
      )}

      {showPlaceModal && (
        <PlaceUploadModal handleClosePopup={closePlaceModal} />
      )}

      <input
        type="file"
        accept="image/*"
        hidden
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <CreateMenu
        label="Create"
        onSelectEvent={openFilePicker}
        onSelectPlace={() => setShowPlaceModal(true)}
        iconClassName="text-3xl"
      />
    </>
  );
}
