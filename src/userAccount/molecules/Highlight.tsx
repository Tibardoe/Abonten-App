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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState<
    string | null
  >(null);

  const handleShowHighlightModal = (state: boolean) => {
    setShowHighlightModal(state);
  };

  // Owned here (not in HighlightModal) because the modal closes immediately
  // on submit — this component stays mounted for as long as the profile
  // page is open, so it can report progress/success/failure after the
  // modal is gone.
  const handleUpload = (mediaItems: MediaItem[]) => {
    setIsUploading(true);

    uploadHighlight(mediaItems).then((response) => {
      setIsUploading(false);

      // Invalidate regardless of status: a partial failure can still mean
      // some slides uploaded successfully, and those must not stay hidden
      // just because the batch as a whole didn't fully succeed.
      queryClient.invalidateQueries({ queryKey: ["highlights", username] });

      if (response.status !== 200) {
        setUploadError(response.message ?? "Failed to upload highlight.");
        setTimeout(() => setUploadError(null), 4000);
        return;
      }

      setUploadSuccessMessage("Highlight uploaded");
      setTimeout(() => setUploadSuccessMessage(null), 2500);
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
        className="shrink-0 disabled:opacity-50"
        disabled={isUploading}
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

      {isUploading && (
        <div className="fixed bottom-24 md:bottom-10 right-[5%] z-30 md:right-[10%] bg-popover text-popover-foreground border border-border p-4 rounded-lg shadow-lg flex items-center gap-3 w-80">
          <div className="border-2 border-primary border-t-transparent animate-spin rounded-full w-4 h-4 shrink-0" />
          Uploading highlight...
        </div>
      )}

      {uploadSuccessMessage && (
        <div className="fixed bottom-24 md:bottom-10 right-[5%] z-30 md:right-[10%] bg-popover text-popover-foreground border border-border p-4 rounded-lg shadow-lg flex items-center justify-center w-80">
          ✅ {uploadSuccessMessage}
        </div>
      )}

      {uploadError && <Notification notification={uploadError} />}
    </>
  );
}
