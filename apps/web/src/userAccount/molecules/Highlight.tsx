"use client";

import MaskIcon from "@/components/atoms/MaskIcon";
import HighlightModal from "@/components/organisms/HighlightModal";
import { useHighlightUpload } from "@/hooks/useHighlightUpload";
import type { MediaItem } from "@/types/mediaItemType";
import { useState } from "react";
import HighlightUploadStatus from "./HighlightUploadStatus";

type HighlightProps = {
  username: string;
};

export default function Higlight({ username }: HighlightProps) {
  const [showHighlighModal, setShowHighlightModal] = useState(false);

  // Owned here (not in HighlightModal) because the modal closes immediately
  // on submit — this component stays mounted for as long as the profile
  // page is open, so it can report per-file progress/success/failure after
  // the modal is gone.
  const upload = useHighlightUpload(username);

  const handleShowHighlightModal = (state: boolean) => {
    setShowHighlightModal(state);
  };

  const handleUpload = (mediaItems: MediaItem[]) => {
    upload.start(mediaItems);
  };

  return (
    <>
      {showHighlighModal && (
        <HighlightModal
          handleShowHighlightModal={handleShowHighlightModal}
          onUpload={handleUpload}
        />
      )}

      <button
        type="button"
        className="shrink-0 disabled:opacity-50"
        disabled={upload.isUploading}
        onClick={() => {
          handleShowHighlightModal(true);
        }}
      >
        <MaskIcon
          src="/assets/images/highlight.svg"
          alt="Highlight button"
          className="w-20 h-20"
        />
      </button>

      <HighlightUploadStatus
        items={upload.items}
        onRetry={upload.retry}
        onDismiss={upload.dismiss}
        onCancel={upload.cancel}
      />
    </>
  );
}
