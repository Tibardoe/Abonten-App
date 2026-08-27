import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

// Every caller mounts/unmounts this to control visibility (see
// AlertDialog's own comment) -- so `open` is always true here, and
// Escape/outside-click route to the same onCancel a Cancel-button click
// would, guarded so an in-flight confirm action can't be dismissed out from
// under itself.
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
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !isLoading) onCancel();
      }}
    >
      <AlertDialogContent preventCloseWhileBusy={isLoading}>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription className="text-destructive">
          {message}
        </AlertDialogDescription>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={isLoading}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading}>
            {isLoading ? (loadingLabel ?? confirmLabel) : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
