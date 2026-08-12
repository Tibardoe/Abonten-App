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
    <div className="fixed top-0 left-0 w-full h-dvh bg-black bg-opacity-50 flex justify-center items-center z-40">
      <div className="w-[70%] md:w-[30%] p-3 bg-white rounded-xl">
        <h1 className="text-md font-bold text-center pb-3">Warning</h1>

        <hr />

        <div className="space-y-2 md:space-y-4">
          <p className="text-red-700 text-center py-3 text-sm">{message}</p>

          <div className="flex gap-2 justify-center text-xs md:text-sm">
            <button
              type="button"
              className="rounded-md border border-black px-3 py-1"
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? "Deleting" : "Yes"}
            </button>
            <button
              type="button"
              className="rounded-md bg-black text-white px-3 py-1"
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
