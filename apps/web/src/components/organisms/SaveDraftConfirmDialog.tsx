import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslations } from "next-intl";

type SaveDraftConfirmDialogProps = {
  message: string;
  isSaving: boolean;
  onSaveDraft: () => void;
  onDiscard: () => void;
  onContinueEditing: () => void;
};

// Three-way variant of ConfirmDeleteModal's pattern (same presentational,
// action-agnostic shape) for the "Cancel with unsaved changes" prompt shared
// by event creation and review authoring. Escape/outside-click resolve to
// "Continue Editing" -- the non-destructive, non-committal option -- rather
// than either saving or discarding on the user's behalf.
export default function SaveDraftConfirmDialog({
  message,
  isSaving,
  onSaveDraft,
  onDiscard,
  onContinueEditing,
}: SaveDraftConfirmDialogProps) {
  const t = useTranslations("common");

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !isSaving) onContinueEditing();
      }}
    >
      <AlertDialogContent preventCloseWhileBusy={isSaving}>
        <AlertDialogTitle className="text-center">
          {t("saveYourProgress")}
        </AlertDialogTitle>
        <AlertDialogDescription className="text-center">
          {message}
        </AlertDialogDescription>

        <div className="flex flex-col gap-2 pt-1 text-sm">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            onClick={onSaveDraft}
            disabled={isSaving}
          >
            {isSaving ? t("saving") : t("saveAsDraft")}
          </button>
          <button
            type="button"
            className="rounded-md border border-destructive px-3 py-2 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
            onClick={onDiscard}
            disabled={isSaving}
          >
            {t("discard")}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 transition-colors hover:bg-accent disabled:opacity-60"
            onClick={onContinueEditing}
            disabled={isSaving}
          >
            {t("continueEditing")}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
