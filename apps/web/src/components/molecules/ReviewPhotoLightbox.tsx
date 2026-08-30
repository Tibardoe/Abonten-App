"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import Image from "next/image";
import { useEffect } from "react";
import { FiX } from "react-icons/fi";

type ReviewPhoto = { id: string; public_id: string; version: string };

type ReviewPhotoLightboxProps = {
  photos: ReviewPhoto[];
  startIndex: number;
  onClose: () => void;
};

// Click-to-enlarge viewer for already-posted review photos. No dedicated
// image lightbox exists elsewhere in this codebase to reuse, so this is new
// -- but it's built entirely on the same Carousel primitive Featured
// Events/Places already use, rather than a separate gallery dependency.
export default function ReviewPhotoLightbox({
  photos,
  startIndex,
  onClose,
}: ReviewPhotoLightboxProps) {
  useBodyScrollLock(true);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
      {/* Click-outside-to-close backdrop -- a real button so it's keyboard/
          screen-reader accessible too, not just a div with an onClick. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo viewer"
        className="absolute inset-0 cursor-default"
      />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
      >
        <FiX className="text-xl" />
      </button>

      <div className="relative w-full max-w-3xl px-4 md:px-12">
        <Carousel opts={{ loop: photos.length > 1, startIndex }}>
          <CarouselContent>
            {photos.map((photo) => (
              <CarouselItem
                key={photo.id}
                className="flex items-center justify-center"
              >
                <div className="relative w-full h-[70vh]">
                  <Image
                    src={buildCloudinaryUrl(photo.public_id, photo.version, {
                      width: 1000,
                    })}
                    alt="Review photo"
                    fill
                    sizes="100vw"
                    className="object-contain"
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>

          {photos.length > 1 && (
            <>
              <CarouselPrevious />
              <CarouselNext />
            </>
          )}
        </Carousel>
      </div>
    </div>
  );
}
