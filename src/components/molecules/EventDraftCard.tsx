"use client";

import { deleteEventDraft } from "@/actions/deleteEventDraft";
import type { EventDraftListItem } from "@/actions/getEventDrafts";
import ContinueEventDraftButton from "@/components/molecules/ContinueEventDraftButton";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { getRelativeTime } from "@/utils/dateFormatter";
import { formatExpiresIn } from "@/utils/formatExpiresIn";
import Image from "next/image";
import { useState } from "react";

type EventDraftCardProps = {
  draft: EventDraftListItem;
  onDeleted: (draftId: string) => void;
  onDraftListChanged: () => void;
};

export default function EventDraftCard({
  draft,
  onDeleted,
  onDraftListChanged,
}: EventDraftCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const thumbnailUrl = draft.flyerPublicId
    ? buildCloudinaryUrl(draft.flyerPublicId, draft.flyerVersion, {
        width: 80,
        height: 80,
      })
    : null;

  const handleDelete = async () => {
    setIsDeleting(true);
    const response = await deleteEventDraft(draft.id);
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
      <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-muted">
        {thumbnailUrl && (
          <Image
            src={thumbnailUrl}
            alt={draft.title ?? "Draft flyer"}
            fill
            className="object-cover"
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">
          {draft.title || "Untitled event"}
        </p>
        <p className="text-sm text-muted-foreground">
          Last edited {getRelativeTime(draft.updatedAt)}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatExpiresIn(draft.expiresAt)}
        </p>
        {error && <p className="text-destructive text-xs mt-1">{error}</p>}
      </div>

      <div className="flex flex-col gap-2 shrink-0">
        <ContinueEventDraftButton
          draftId={draft.id}
          className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm hover:bg-primary/90 transition-colors"
          onDraftListChanged={onDraftListChanged}
        >
          Continue
        </ContinueEventDraftButton>

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
