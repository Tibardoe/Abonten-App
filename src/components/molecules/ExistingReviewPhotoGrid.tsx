"use client";

import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import Image from "next/image";
import { FiX } from "react-icons/fi";

type ExistingReviewPhoto = {
  id: string;
  public_id: string;
  version: string;
  position: number;
};

type ExistingReviewPhotoGridProps = {
  photos: ExistingReviewPhoto[];
  onRemove: (photoId: string) => void;
};

// Shows a review's already-attached photos inside the edit modal (event and
// place reviews both), each removable before save -- companion to
// ReviewPhotoPicker.tsx, which only handles newly selected files. Removal
// here is staged client-side (see EventReviewModal.tsx/PlaceReviewModal.tsx's
// removedPhotoIds state) and only takes effect once the edit is submitted.
export default function ExistingReviewPhotoGrid({
  photos,
  onRemove,
}: ExistingReviewPhotoGridProps) {
  if (photos.length === 0) return null;

  const sorted = [...photos].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">Current photos</p>

      <div className="flex flex-wrap gap-2">
        {sorted.map((photo) => (
          <div
            key={photo.id}
            className="relative w-20 h-20 rounded-lg overflow-hidden border border-border bg-muted"
          >
            <Image
              src={buildCloudinaryUrl(photo.public_id, photo.version, {
                width: 80,
                height: 80,
              })}
              alt="Review photo"
              fill
              sizes="80px"
              className="object-cover"
            />

            <button
              type="button"
              onClick={() => onRemove(photo.id)}
              aria-label="Remove photo"
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-black/80 transition-colors"
            >
              <FiX className="text-xs" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
