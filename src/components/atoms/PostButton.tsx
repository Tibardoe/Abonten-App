"use client";

import { getActiveDraftCounts } from "@/actions/getActiveDraftCounts";
import { useImageSelection } from "@/hooks/useImageSelection";
import { useState } from "react";
import NewEventOrDraftChooser from "../molecules/NewEventOrDraftChooser";
import EventUploadModal from "../organisms/EventUploadModal";
import { Button } from "../ui/button";

// Single "Post" trigger for event upload at every breakpoint, replacing the
// previous pair of desktop/mobile buttons that each mounted their own full
// event upload modal simultaneously (switching which was visible via CSS
// only) rather than mounting one on demand.
export default function PostButton() {
  const [showPostModal, setShowPostModal] = useState(false);
  const [showChooser, setShowChooser] = useState(false);

  const {
    imagePreview,
    selectedFile,
    fileInputRef,
    openFilePicker,
    handleFileChange,
  } = useImageSelection({
    invalidFileMessage: "Please select an image file for your event flyer.",
    onInvalidFile: (message) => alert(message),
    onSelect: () => setShowPostModal(true),
  });

  const closePopup = (state: boolean) => setShowPostModal(state);

  const handleClick = async () => {
    const { data } = await getActiveDraftCounts();
    if (data.event > 0) {
      setShowChooser(true);
    } else {
      openFilePicker();
    }
  };

  return (
    <>
      <Button className="px-10 font-medium text-sm mt-5" onClick={handleClick}>
        Post
      </Button>

      <input
        type="file"
        accept="image/*"
        hidden
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      {showChooser && (
        <NewEventOrDraftChooser
          onCreateNew={() => {
            setShowChooser(false);
            openFilePicker();
          }}
          onClose={() => setShowChooser(false)}
        />
      )}

      {showPostModal && imagePreview && selectedFile && (
        <EventUploadModal
          handleClosePopup={closePopup}
          imgUrl={imagePreview}
          selectedFile={selectedFile}
        />
      )}
    </>
  );
}
