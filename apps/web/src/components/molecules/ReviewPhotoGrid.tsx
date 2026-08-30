"use client";

import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import Image from "next/image";
import { useState } from "react";
import ReviewPhotoLightbox from "./ReviewPhotoLightbox";

type ReviewPhoto = {
  id: string;
  public_id: string;
  version: string;
  position: number;
};

type ReviewPhotoGridProps = {
  photos: ReviewPhoto[] | null | undefined;
};

// Thumbnail grid for a review's attached photos (place_review_photo /
// event_review_photo, both selected with the same id/public_id/version/
// position shape) -- shared by PlaceReviewsSection, ManagePlaceReviewsSection,
// and EventReviewsSection so review photo display stays one component, not
// three copies.
export default function ReviewPhotoGrid({ photos }: ReviewPhotoGridProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!photos || photos.length === 0) return null;

  const sorted = [...photos].sort((a, b) => a.position - b.position);

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-3">
        {sorted.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setOpenIndex(index)}
            aria-label="View photo larger"
            className="relative w-20 h-20 rounded-lg overflow-hidden border border-border"
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
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <ReviewPhotoLightbox
          photos={sorted}
          startIndex={openIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}
