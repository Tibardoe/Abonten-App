"use client";

import { useImageSelection } from "@/hooks/useImageSelection";
import { useState } from "react";
import AvatarUploadModal from "../organisms/AvatarUploadModal";
import { Button } from "../ui/button";

// Single trigger for avatar upload at every breakpoint, replacing the
// previous pair of desktop-only/mobile-only buttons (which only differed by
// which one Tailwind's `hidden`/`flex` classes showed).
export default function AvatarUploadButton() {
  const [showPopup, setShowPopup] = useState(false);

  const { imagePreview, fileInputRef, openFilePicker, handleFileChange } =
    useImageSelection({
      invalidFileMessage:
        "Please select an image file for your profile picture.",
      onInvalidFile: (message) => alert(message),
      onSelect: () => setShowPopup(true),
    });

  const closePopup = (state: boolean) => setShowPopup(state);

  return (
    <>
      {showPopup && imagePreview && (
        <AvatarUploadModal
          handleClosePopup={closePopup}
          imgUrl={imagePreview}
        />
      )}

      <input
        type="file"
        accept="image/*"
        hidden
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <Button className="font-bold bg-mint" onClick={openFilePicker}>
        Change Photo
      </Button>
    </>
  );
}
