import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

type ConfirmDeleteModalProps = {
  message: string;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDeleteModal({
  message,
  isLoading,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  useBodyScrollLock(true);

  return (
    <div className="fixed top-0 left-0 w-full h-dvh bg-overlay/50 flex justify-center items-center z-40">
      <div className="w-[70%] md:w-[30%] p-3 bg-card text-card-foreground rounded-xl shadow-lg">
        <h1 className="text-md font-bold text-center pb-3">Warning</h1>

        <hr className="border-border" />

        <div className="space-y-2 md:space-y-4">
          <p className="text-destructive text-center py-3 text-sm">{message}</p>

          <div className="flex gap-2 justify-center text-xs md:text-sm">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1 hover:bg-accent transition-colors"
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? "Deleting" : "Yes"}
            </button>
            <button
              type="button"
              className="rounded-md bg-primary text-primary-foreground px-3 py-1 hover:bg-primary/90 transition-colors"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
