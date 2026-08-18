"use client";

import { useImageSelection } from "@/hooks/useImageSelection";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@/utils/uploadLimits";
import { useState } from "react";
import { IoCreateOutline } from "react-icons/io5";
import EventUploadModal from "../organisms/EventUploadModal";

// Desktop nav-link trigger for event upload (rendered only inside the
// desktop header). Picks the flyer itself, then opens EventUploadModal.
export default function EventUploadButton() {
  const [showPopup, setShowPopup] = useState(false);

  const {
    imagePreview,
    selectedFile,
    fileInputRef,
    openFilePicker,
    handleFileChange,
  } = useImageSelection({
    invalidFileMessage: "Please select an image file for your event flyer.",
    maxSizeBytes: MAX_EVENT_FLYER_SIZE_BYTES,
    onInvalidFile: (message) => alert(message),
    onSelect: () => setShowPopup(true),
  });

  const closePopup = (state: boolean) => setShowPopup(state);

  return (
    <>
      {showPopup && imagePreview && selectedFile && (
        <EventUploadModal
          handleClosePopup={closePopup}
          imgUrl={imagePreview}
          selectedFile={selectedFile}
        />
      )}

      <input
        type="file"
        accept="image/*"
        hidden
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <button
        type="button"
        className="flex gap-1 items-center"
        onClick={openFilePicker}
      >
        <IoCreateOutline className="text-3xl" />
        Post
      </button>
    </>
  );
}
