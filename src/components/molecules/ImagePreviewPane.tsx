"use client";

import { cn } from "@/components/lib/utils";
import { ScissorsIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

type ImagePreviewPaneProps = {
  src: string;
  alt?: string;
  className?: string;
  imageClassName?: string;
  onCropToggle?: () => void;
};

// Shared "preview a selected/cropped image, with a spinner until it's
// decoded and an optional crop toggle" block used by the event flyer and
// avatar upload flows. Requires a positioned (relative/absolute) wrapper,
// sized by the caller via `className`.
export default function ImagePreviewPane({
  src,
  alt = "Selected image",
  className,
  imageClassName,
  onCropToggle,
}: ImagePreviewPaneProps) {
  const [isReady, setIsReady] = useState(false);

  // Reset the ready-gate whenever the image being shown changes (e.g. a
  // fresh crop replaces the plain selection preview) so the spinner shows
  // again instead of leaving the previous frame on screen while the new one
  // decodes. Adjusted during render (React's recommended alternative to an
  // effect for this) rather than via useEffect, since the reset doesn't
  // otherwise reference `src`.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setIsReady(false);
  }

  return (
    <div className={cn("relative", className)}>
      {onCropToggle && (
        <button
          type="button"
          className="backdrop-blur-md border border-white/20 bg-black bg-opacity-75 p-2 rounded-full absolute top-1 left-5 z-10"
          onClick={onCropToggle}
          aria-label="Crop image"
        >
          <ScissorsIcon className="w-5 h-5 text-white" />
        </button>
      )}

      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border-4 border-mint border-t-transparent animate-spin rounded-full w-10 h-10" />
        </div>
      )}

      <Image
        src={src}
        alt={alt}
        fill
        className={cn(
          "object-contain",
          isReady ? "" : "hidden",
          imageClassName,
        )}
        onLoad={() => setIsReady(true)}
      />
    </div>
  );
}
