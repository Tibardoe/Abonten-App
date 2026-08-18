"use client";

import { cn } from "@/components/lib/utils";
import { ScissorsIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

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
    setHasError(false);
  }

  // A cached (or otherwise already-resolved) image can finish loading
  // before this listener is attached — every use of this component so far
  // was a fresh local blob URL, always "uncached" by definition, so this
  // never surfaced until a real remote (Cloudinary) src was fed in. Catch
  // that missed event by checking the underlying <img>'s own `.complete`
  // flag once mounted, rather than relying on onLoad alone.
  // biome-ignore lint/correctness/useExhaustiveDependencies: src isn't read in the body, but a new src is exactly when this "already cached?" check needs to re-run.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setIsReady(true);
    }
  }, [src]);

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

      {!isReady && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="border-4 border-mint border-t-transparent animate-spin rounded-full w-10 h-10" />
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-muted-foreground px-4">
          Couldn't load this image.
        </div>
      )}

      {!hasError && (
        <Image
          ref={imgRef}
          src={src}
          alt={alt}
          fill
          sizes="100vw"
          className={cn(
            "object-contain",
            isReady ? "" : "hidden",
            imageClassName,
          )}
          onLoad={() => setIsReady(true)}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
}
