"use client";

import { deletePlaceDraft } from "@/actions/deletePlaceDraft";
import type { PlaceDraftListItem } from "@/actions/getPlaceDrafts";
import ContinuePlaceDraftButton from "@/components/molecules/ContinuePlaceDraftButton";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { getRelativeTime } from "@abonten/core/dateFormatter";
import { formatExpiresIn } from "@abonten/core/formatExpiresIn";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { useState } from "react";

type PlaceDraftCardProps = {
  draft: PlaceDraftListItem;
  onDeleted: (draftId: string) => void;
  // Puts the draft back if the server rejects the delete — the card itself
  // has already unmounted by then (see handleDelete), so the parent list is
  // the only place left that can show it again.
  onRestoreDraft: (draft: PlaceDraftListItem) => void;
  onDeleteError: (message: string) => void;
  onDraftListChanged: () => void;
};

// Mirrors EventDraftCard.tsx exactly, swapping the flyer thumbnail for a
// cover-photo one.
export default function PlaceDraftCard({
  draft,
  onDeleted,
  onRestoreDraft,
  onDeleteError,
  onDraftListChanged,
}: PlaceDraftCardProps) {
  const locale = useLocale();

  const t = useTranslations("common");
  const tc = useTranslations("core");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const thumbnailUrl = draft.coverPublicId
    ? buildCloudinaryUrl(draft.coverPublicId, draft.coverVersion, {
        width: 80,
        height: 80,
      })
    : null;

  // Draft deletion is a low-stakes, easily-reversible soft delete, so the
  // card leaves the list the moment the user confirms rather than waiting
  // on the round trip; a rejected delete puts it back with an explanation.
  const handleDelete = () => {
    setShowDeleteConfirm(false);
    onDeleted(draft.id);

    deletePlaceDraft(draft.id)
      .catch(actionUnreachable)
      .then((response) => {
        if (response.status !== 200) {
          onRestoreDraft(draft);
          onDeleteError(response.message ?? t("couldnTDeleteThisDraft"));
        }
      });
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card text-card-foreground p-3 shadow-sm">
      <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-muted">
        {thumbnailUrl && (
          <Image
            src={thumbnailUrl}
            alt={draft.title ?? t("draftCoverPhoto")}
            fill
            className="object-cover"
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">
          {draft.title || t("untitledPlace")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("lastEdited", {
            getRelativeTime: getRelativeTime(
              draft.updatedAt,
              undefined,
              locale,
            ),
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatExpiresIn(tc, draft.expiresAt)}
        </p>
      </div>

      <div className="flex flex-col gap-2 shrink-0">
        <ContinuePlaceDraftButton
          draftId={draft.id}
          className="rounded-md bg-primary text-primary-foreground px-3 py-1 text-sm hover:bg-primary/90 transition-colors"
          onDraftListChanged={onDraftListChanged}
        >
          {t("continueText")}
        </ContinuePlaceDraftButton>

        <button
          type="button"
          className="rounded-md border border-destructive text-destructive px-3 py-1 text-sm hover:bg-destructive/10 transition-colors"
          onClick={() => setShowDeleteConfirm(true)}
        >
          {t("deleteText")}
        </button>
      </div>

      {showDeleteConfirm && (
        <ConfirmDeleteModal
          title={t("deleteThisDraft")}
          message={t("deleteThisDraftThisCannotBe")}
          confirmLabel={t("deleteDraft")}
          isLoading={false}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
