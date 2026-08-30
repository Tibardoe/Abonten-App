"use client";

import type { ReviewPhotoUploadItem } from "@/hooks/useReviewPhotoUpload";
import { MAX_REVIEW_PHOTOS } from "@/utils/uploadLimits";
import Image from "next/image";
import { useRef } from "react";
import { FiCamera, FiX } from "react-icons/fi";

type ReviewPhotoPickerProps = {
  items: ReviewPhotoUploadItem[];
  atLimit: boolean;
  onFilesSelected: (files: File[]) => void;
  onRemove: (id: string) => void;
};

// Shared photo picker for the review-submission modals (place and event) --
// one review-photo UI, not two. Deliberately no `capture` attribute on the
// file input: most mobile browsers already offer both "Camera" and "Photo
// Library" from a plain `accept="image/*"` file input, whereas `capture`
// forces straight to the camera and hides the gallery option -- since both
// "take a photo" and "pick an existing one" are required, the plain input is
// the one that supports both.
export default function ReviewPhotoPicker({
  items,
  atLimit,
  onFilesSelected,
  onRemove,
}: ReviewPhotoPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onFilesSelected(files);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Photos (optional)</p>
        <span className="text-xs text-muted-foreground">
          {items.length}/{MAX_REVIEW_PHOTOS}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted"
          >
            <Image
              src={item.previewUrl}
              alt={`Selected photo: ${item.fileName}`}
              fill
              sizes="80px"
              className="object-cover"
            />

            {(item.status === "signing" || item.status === "uploading") && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="border-2 border-white border-t-transparent animate-spin rounded-full w-5 h-5" />
              </div>
            )}

            {item.status === "error" && (
              <div
                className="absolute inset-0 bg-destructive/80 flex items-center justify-center p-1"
                title={item.errorMessage ?? "Upload failed"}
              >
                <p className="text-white text-[10px] leading-tight text-center line-clamp-3">
                  {item.errorMessage ?? "Upload failed"}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => onRemove(item.id)}
              aria-label={`Remove ${item.fileName}`}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition-colors"
            >
              <FiX className="text-xs" />
            </button>
          </div>
        ))}

        {!atLimit && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            <FiCamera className="text-lg" />
            <span className="text-[10px]">Add photo</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleChange}
      />
    </div>
  );
}
