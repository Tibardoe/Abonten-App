"use client";

import { type PlaceDraftDetail, getPlaceDraft } from "@/actions/getPlaceDraft";
import PlaceUploadModal from "@/places/organisms/PlaceUploadModal";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

type ContinuePlaceDraftButtonProps = {
  draftId: string;
  className?: string;
  children: ReactNode;
  onDraftListChanged: () => void;
};

// Loads a draft's full payload, then opens PlaceUploadModal directly.
// Simpler than ContinueEventDraftButton.tsx: Place creation's Basic Info
// step (step 1) isn't a photo step, so there's no "pick a file before the
// modal can open" requirement here — the Photos step (step 2) shows the
// existing cover photo via existingCoverPreviewUrl if the owner hasn't
// picked a replacement, exactly like a fresh selection would.
export default function ContinuePlaceDraftButton({
  draftId,
  className,
  children,
  onDraftListChanged,
}: ContinuePlaceDraftButtonProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<PlaceDraftDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const handleContinue = async () => {
    setLoading(true);
    setError(null);

    const response = await getPlaceDraft(draftId);
    setLoading(false);

    if (response.status !== 200 || !response.data) {
      setError(response.message);
      return;
    }

    setDraft(response.data);
    setShowModal(true);
  };

  const existingCoverPreviewUrl = draft?.coverPublicId
    ? buildCloudinaryUrl(draft.coverPublicId, draft.coverVersion, {
        width: 700,
      })
    : undefined;

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

      {error && <p className="text-destructive text-sm mt-1">{error}</p>}

      {showModal && draft && (
        <PlaceUploadModal
          handleClosePopup={() => setShowModal(false)}
          draftId={draft.id}
          initialValues={draft.payload}
          initialUpdatedAt={draft.updatedAt}
          existingCoverPhoto={
            draft.coverPublicId && draft.coverVersion
              ? { public_id: draft.coverPublicId, version: draft.coverVersion }
              : undefined
          }
          existingCoverPreviewUrl={existingCoverPreviewUrl}
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
