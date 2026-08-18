"use client";

import { deleteReviewDraft } from "@/actions/deleteReviewDraft";
import type { ReviewDraftListItem } from "@/actions/getReviewDrafts";
import Rating from "@/components/atoms/Rating";
import ContinueReviewDraftButton from "@/components/molecules/ContinueReviewDraftButton";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { getRelativeTime } from "@/utils/dateFormatter";
import { formatExpiresIn } from "@/utils/formatExpiresIn";
import { useState } from "react";

type ReviewDraftCardProps = {
  draft: ReviewDraftListItem;
  onDeleted: (draftId: string) => void;
};

export default function ReviewDraftCard({
  draft,
  onDeleted,
}: ReviewDraftCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    const response = await deleteReviewDraft(draft.id);
    setIsDeleting(false);

    if (response.status === 200) {
      setShowDeleteConfirm(false);
      onDeleted(draft.id);
    } else {
      setError(response.message);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card text-card-foreground p-3 shadow-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold truncate">
            {draft.title || "Untitled review"}
          </p>
          {draft.rating ? <Rating rating={draft.rating} /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Last edited {getRelativeTime(draft.updatedAt)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatExpiresIn(draft.expiresAt)}
        </p>
        {error && <p className="text-destructive text-xs mt-1">{error}</p>}
      </div>

      <div className="flex flex-col gap-2 shrink-0">
        <ContinueReviewDraftButton
          draftId={draft.id}
          className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm hover:bg-primary/90 transition-colors"
        >
          Continue
        </ContinueReviewDraftButton>

        <button
          type="button"
          className="rounded-md border border-destructive text-destructive px-3 py-1 text-sm hover:bg-destructive/10 transition-colors"
          onClick={() => setShowDeleteConfirm(true)}
        >
          Delete
        </button>
      </div>

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          message="Delete this draft? This cannot be undone."
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
