"use client";

import type { HighlightUploadItem } from "@/types/highlightUploadType";

type HighlightUploadStatusProps = {
  items: HighlightUploadItem[];
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
};

const STATUS_LABEL: Record<HighlightUploadItem["status"], string> = {
  signing: "Preparing upload...",
  uploading: "Uploading highlight...",
  saving: "Almost done...",
  success: "Highlight uploaded",
  error: "Upload failed",
};

export default function HighlightUploadStatus({
  items,
  onRetry,
  onDismiss,
}: HighlightUploadStatusProps) {
  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-24 md:bottom-10 right-[5%] z-30 md:right-[10%] flex flex-col gap-2 w-80">
      {items.map((item) => (
        <div
          key={item.id}
          className="bg-popover text-popover-foreground border border-border p-4 rounded-lg shadow-lg"
        >
          {item.status === "success" ? (
            <div className="flex items-center justify-center">
              ✅ {STATUS_LABEL.success}
            </div>
          ) : item.status === "error" ? (
            <div className="flex flex-col gap-2">
              <span>⚠️ {item.errorMessage ?? STATUS_LABEL.error}</span>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => onDismiss(item.id)}
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  className="text-sm text-primary font-medium hover:underline"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="border-2 border-primary border-t-transparent animate-spin rounded-full w-4 h-4 shrink-0" />
                {STATUS_LABEL[item.status]}
              </div>
              {item.status === "uploading" && (
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-[width] duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
