"use client";

import uploadHighlight from "@/actions/uploadHighlight";
import Notification from "@/components/atoms/Notification";
import HighlightModal from "@/components/organisms/HighlightModal";
import type { MediaItem } from "@/types/mediaItemType";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useState } from "react";

type HighlightProps = {
  username: string;
};

export default function Higlight({ username }: HighlightProps) {
  const queryClient = useQueryClient();

  const [showHighlighModal, setShowHighlightModal] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleShowHighlightModal = (state: boolean) => {
    setShowHighlightModal(state);
  };

  // Owned here (not in HighlightModal) because the modal closes immediately
  // on submit — this component stays mounted for as long as the profile
  // page is open, so it can report success/failure after the modal is gone.
  const handleUpload = (mediaItems: MediaItem[]) => {
    uploadHighlight(mediaItems).then((response) => {
      if (response.status !== 200) {
        setUploadError(response.message ?? "Failed to upload highlight.");
        setTimeout(() => setUploadError(null), 4000);
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["highlights", username] });
    });
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
        className="shrink-0"
        onClick={() => {
          handleShowHighlightModal(true);
        }}
      >
        <Image
          src="/assets/images/highlight.svg"
          alt="Highlight button"
          width={80}
          height={80}
        />
      </button>

      {uploadError && <Notification notification={uploadError} />}
    </>
  );
}
