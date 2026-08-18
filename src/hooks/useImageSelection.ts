"use client";

import { isImageFile } from "@/utils/isImageFile";
import { useEffect, useRef, useState } from "react";

type UseImageSelectionOptions = {
  onInvalidFile?: (message: string) => void;
  invalidFileMessage?: string;
  // Rejects a selection before it's ever previewed or handed to a Server
  // Action — those actions receive the raw File as an argument, and Next.js
  // rejects any Server Action request body over 5MB (see uploadHighlight.ts
  // for the same limit hit by videos). Optional so callers that don't pass
  // it (none currently) keep today's unlimited-size behavior.
  maxSizeBytes?: number;
  onSelect?: (file: File, previewUrl: string) => void;
};

// Shared "pick an image file, validate it, preview it" behavior used by
// every upload trigger (event flyer, avatar). Owns the preview object URL's
// lifecycle so callers don't each have to remember to revoke it.
export function useImageSelection({
  onInvalidFile,
  invalidFileMessage = "Please select an image file.",
  maxSizeBytes,
  onSelect,
}: UseImageSelectionOptions = {}) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!isImageFile(file)) {
      onInvalidFile?.(invalidFileMessage);
      return;
    }

    if (maxSizeBytes && file.size > maxSizeBytes) {
      const maxMb = Math.round(maxSizeBytes / (1024 * 1024));
      onInvalidFile?.(`Image is too large. Maximum size is ${maxMb}MB.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setSelectedFile(file);
    onSelect?.(file, previewUrl);
  };

  const reset = () => {
    setImagePreview(null);
    setSelectedFile(null);
  };

  return {
    imagePreview,
    selectedFile,
    fileInputRef,
    openFilePicker,
    handleFileChange,
    reset,
  };
}
