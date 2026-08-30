"use client";

import { useEffect, useState } from "react";

type UseCroppedImageOptions = {
  onCropped?: (file: File, previewUrl: string) => void;
};

// Shared "hold the result of a crop and its preview URL" behavior used by
// every crop flow (event flyer, avatar). Owns the preview object URL's
// lifecycle so callers don't each have to remember to revoke it.
export function useCroppedImage({ onCropped }: UseCroppedImageOptions = {}) {
  const [cropped, setCropped] = useState<File | null>(null);
  const [croppedPreview, setCroppedPreview] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (croppedPreview) URL.revokeObjectURL(croppedPreview);
    };
  }, [croppedPreview]);

  const handleCropped = (croppedFile: File) => {
    setCropped(croppedFile);
    const preview = URL.createObjectURL(croppedFile);
    setCroppedPreview(preview);
    onCropped?.(croppedFile, preview);
  };

  const reset = () => {
    setCropped(null);
    setCroppedPreview(null);
  };

  return { cropped, croppedPreview, handleCropped, reset };
}
