"use client";

import { getActiveDraftCounts } from "@/actions/getActiveDraftCounts";
import { EventUploadModal } from "@/components/organisms/LazyUploadModals";
import { useImageSelection } from "@/hooks/useImageSelection";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@abonten/core/uploadLimits";
import { useTranslations } from "next-intl";
import { useState } from "react";
import NewEventOrDraftChooser from "../molecules/NewEventOrDraftChooser";
import { Button } from "../ui/button";

// Single "Post" trigger for event upload at every breakpoint, replacing the
// previous pair of desktop/mobile buttons that each mounted their own full
// event upload modal simultaneously (switching which was visible via CSS
// only) rather than mounting one on demand.
export default function PostButton() {
  const t = useTranslations("common");

  const [showPostModal, setShowPostModal] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const {
    imagePreview,
    selectedFile,
    fileInputRef,
    openFilePicker,
    handleFileChange,
  } = useImageSelection({
    invalidFileMessage: t("pleaseSelectAnImageFileFor2"),
    maxSizeBytes: MAX_EVENT_FLYER_SIZE_BYTES,
    // A brief inline error rather than the native alert() this used to
    // call -- consistent with ContinueEventDraftButton's existing pattern
    // for the same failure.
    onInvalidFile: (message) => setFileError(message),
    onSelect: () => {
      setFileError(null);
      setShowPostModal(true);
    },
  });

  const closePopup = (state: boolean) => setShowPostModal(state);

  const handleClick = async () => {
    const { data } = await getActiveDraftCounts().catch(actionUnreachable);
    if ((data?.event ?? 0) > 0) {
      setShowChooser(true);
    } else {
      openFilePicker();
    }
  };

  return (
    <>
      <Button className="px-10 font-medium text-sm mt-5" onClick={handleClick}>
        {t("createEvent")}
      </Button>
      {fileError && (
        <p className="text-destructive text-sm mt-1">{fileError}</p>
      )}

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
