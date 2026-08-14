"use client";

import { isImageFile } from "@/utils/isImageFile";
import { useEffect, useRef, useState } from "react";

type UseImageSelectionOptions = {
  onInvalidFile?: (message: string) => void;
  invalidFileMessage?: string;
  onSelect?: (file: File, previewUrl: string) => void;
};

// Shared "pick an image file, validate it, preview it" behavior used by
// every upload trigger (event flyer, avatar). Owns the preview object URL's
// lifecycle so callers don't each have to remember to revoke it.
export function useImageSelection({
  onInvalidFile,
  invalidFileMessage = "Please select an image file.",
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
