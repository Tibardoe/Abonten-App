"use client";

import { type EventDraftDetail, getEventDraft } from "@/actions/getEventDraft";
import EventUploadModal from "@/components/organisms/EventUploadModal";
import { useImageSelection } from "@/hooks/useImageSelection";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

type ContinueEventDraftButtonProps = {
  draftId: string;
  className?: string;
  children: ReactNode;
  onDraftListChanged: () => void;
};

// Loads a draft's full payload, then opens EventUploadModal directly
// (bypassing the normal pick-a-file-first entry) if it already has an
// uploaded flyer, or falls back to the ordinary file picker first if it
// doesn't — a draft can be as bare as just a title.
export default function ContinueEventDraftButton({
  draftId,
  className,
  children,
  onDraftListChanged,
}: ContinueEventDraftButtonProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<EventDraftDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const {
    imagePreview,
    selectedFile,
    fileInputRef,
    openFilePicker,
    handleFileChange,
  } = useImageSelection({
    invalidFileMessage: "Please select an image file for your event flyer.",
    onInvalidFile: (message) => setError(message),
    onSelect: () => setShowModal(true),
  });

  const handleContinue = async () => {
    setLoading(true);
    setError(null);

    const response = await getEventDraft(draftId);
    setLoading(false);

    if (response.status !== 200 || !response.data) {
      setError(response.message);
      return;
    }

    setDraft(response.data);

    if (response.data.flyerPublicId) {
      setShowModal(true);
    } else {
      openFilePicker();
    }
  };

  const hasExistingFlyer = Boolean(draft?.flyerPublicId);
  const imgUrl = hasExistingFlyer
    ? buildCloudinaryUrl(draft?.flyerPublicId, draft?.flyerVersion, {
        width: 700,
      })
    : (imagePreview ?? "");

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={handleContinue}
        disabled={loading}
      >
        {loading ? "Loading..." : children}
      </button>

      <input
        type="file"
        accept="image/*"
        hidden
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      {error && <p className="text-destructive text-sm mt-1">{error}</p>}

      {showModal && draft && (hasExistingFlyer || selectedFile) && (
        <EventUploadModal
          handleClosePopup={() => setShowModal(false)}
          imgUrl={imgUrl}
          selectedFile={hasExistingFlyer ? null : selectedFile}
          existingFlyer={
            hasExistingFlyer && !selectedFile
              ? {
                  public_id: draft.flyerPublicId as string,
                  version: draft.flyerVersion as string,
                }
              : undefined
          }
          draftId={draft.id}
          initialValues={draft.payload}
          initialUpdatedAt={draft.updatedAt}
          onUploadSuccess={() => {
            router.refresh();
            onDraftListChanged();
          }}
          onDraftSaved={onDraftListChanged}
        />
      )}
    </>
  );
}
