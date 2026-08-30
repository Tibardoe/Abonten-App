"use client";

import { getReviewDraft } from "@/actions/getReviewDraft";
import ReviewModal from "@/components/organisms/ReviewModal";
import type { ReactNode } from "react";
import { useState } from "react";

type ContinueReviewDraftButtonProps = {
  draftId: string;
  className?: string;
  children: ReactNode;
  onDraftListChanged: () => void;
};

// Loads the draft's full payload and re-verifies review eligibility
// (attendance, not-already-reviewed) before opening ReviewModal — a draft
// saved days ago may no longer be submittable, and that's surfaced here
// instead of letting stale data reach the submit action.
export default function ContinueReviewDraftButton({
  draftId,
  className,
  children,
  onDraftListChanged,
}: ContinueReviewDraftButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalData, setModalData] = useState<{
    username: string;
    initialValues: {
      title: string | null;
      comment: string | null;
      rating: number | null;
    };
    initialUpdatedAt: string;
  } | null>(null);

  const handleContinue = async () => {
    setLoading(true);
    setError(null);

    const response = await getReviewDraft(draftId);
    setLoading(false);

    if (response.status !== 200 || !response.data) {
      setError(response.message);
      return;
    }

    if (response.data.ineligibleReason) {
      setError(response.data.ineligibleReason);
      return;
    }

    if (!response.data.reviewedUsername) {
      setError("This draft's target user no longer exists.");
      return;
    }

    setModalData({
      username: response.data.reviewedUsername,
      initialValues: {
        title: response.data.title,
        comment: response.data.comment,
        rating: response.data.rating,
      },
      initialUpdatedAt: response.data.updatedAt,
    });
  };

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

      {error && <p className="text-destructive text-xs mt-1">{error}</p>}

      {modalData && (
        <ReviewModal
          handleShowReviewModal={() => setModalData(null)}
          username={modalData.username}
          draftId={draftId}
          initialValues={modalData.initialValues}
          initialUpdatedAt={modalData.initialUpdatedAt}
          onReviewSubmitted={onDraftListChanged}
          onDraftSaved={onDraftListChanged}
        />
      )}
    </>
  );
}
