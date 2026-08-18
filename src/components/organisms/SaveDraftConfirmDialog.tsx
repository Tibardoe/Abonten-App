import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

type SaveDraftConfirmDialogProps = {
  message: string;
  isSaving: boolean;
  onSaveDraft: () => void;
  onDiscard: () => void;
  onContinueEditing: () => void;
};

// Three-way variant of ConfirmDeleteModal's pattern (same presentational,
// action-agnostic shape) for the "Cancel with unsaved changes" prompt shared
// by event creation and review authoring.
export default function SaveDraftConfirmDialog({
  message,
  isSaving,
  onSaveDraft,
  onDiscard,
  onContinueEditing,
}: SaveDraftConfirmDialogProps) {
  useBodyScrollLock(true);

  return (
    <div className="fixed top-0 left-0 w-full h-dvh bg-overlay/50 flex justify-center items-center z-40">
      <div className="w-[85%] md:w-[30%] p-4 bg-card text-card-foreground rounded-xl shadow-lg">
        <h1 className="text-md font-bold text-center pb-3">
          Save your progress?
        </h1>

        <hr className="border-border" />

        <p className="text-center py-3 text-sm text-muted-foreground">
          {message}
        </p>

        <div className="flex flex-col gap-2 text-sm">
          <button
            type="button"
            className="rounded-md bg-primary text-primary-foreground px-3 py-2 hover:bg-primary/90 transition-colors"
            onClick={onSaveDraft}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save as Draft"}
          </button>
          <button
            type="button"
            className="rounded-md border border-destructive text-destructive px-3 py-2 hover:bg-destructive/10 transition-colors"
            onClick={onDiscard}
            disabled={isSaving}
          >
            Discard
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2 hover:bg-accent transition-colors"
            onClick={onContinueEditing}
            disabled={isSaving}
          >
            Continue Editing
          </button>
        </div>
      </div>
    </div>
  );
}
