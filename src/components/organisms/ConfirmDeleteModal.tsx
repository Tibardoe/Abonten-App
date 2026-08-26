import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

type ConfirmDeleteModalProps = {
  /** Short question naming the action, e.g. "Delete this event?" */
  title: string;
  /** What will happen and whether it's reversible. */
  message: string;
  /** Verb-specific confirm label, e.g. "Delete Event", "Cancel Ticket". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Shown on the confirm button while isLoading is true. Defaults to confirmLabel. */
  loadingLabel?: string;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDeleteModal({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  loadingLabel,
  isLoading,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  useBodyScrollLock(true);

  return (
    <div className="fixed top-0 left-0 w-full h-dvh bg-overlay/50 flex justify-center items-center z-40">
      <div className="w-[70%] md:w-[30%] p-3 bg-card text-card-foreground rounded-xl shadow-lg">
        <h1 className="text-base font-semibold text-center pb-3">{title}</h1>

        <hr className="border-border" />

        <div className="space-y-2 md:space-y-4">
          <p className="text-destructive text-center py-3 text-sm">{message}</p>

          <div className="flex gap-2 justify-center text-xs md:text-sm">
            <button
              type="button"
              className="rounded-md bg-destructive text-destructive-foreground px-3 py-1 hover:bg-destructive/90 transition-colors disabled:opacity-60"
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? (loadingLabel ?? confirmLabel) : confirmLabel}
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1 hover:bg-accent transition-colors disabled:opacity-60"
              onClick={onCancel}
              disabled={isLoading}
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
