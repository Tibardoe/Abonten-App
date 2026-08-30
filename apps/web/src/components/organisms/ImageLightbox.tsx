"use client";

import ModalShell from "@/components/atoms/ModalShell";
import { cn } from "@/components/lib/utils";
import Image from "next/image";
import { useEffect, useState } from "react";
import { IoClose } from "react-icons/io5";

type ImageLightboxProps = {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
};

// Reusable full-screen image viewer -- used today for profile pictures
// (public profile + Edit Profile), but generic enough for any future
// "tap an image to see it larger" need. Built on the shared ModalShell
// (Radix Dialog) rather than the hand-rolled shouldRender/isClosing state
// machine this used to run for itself -- Radix's own data-[state] +
// Presence already keeps the panel mounted through its exit animation and
// already traps focus/handles Escape, so none of that needs reimplementing
// here anymore.
export default function ImageLightbox({
  src,
  alt,
  open,
  onClose,
}: ImageLightboxProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Reset per open (not per mount -- this component instance persists
  // across open/close cycles) so a stale spinner/error state from a
  // previous image never bleeds into the next one.
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      setHasError(false);
    }
  }, [open]);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={alt}
      overlayClassName="bg-overlay/90"
      className="p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
    >
      {/* Clicking the backdrop is a mouse/touch convenience on top of an
          already-adequate keyboard path (Escape, handled by Radix) -- a
          redundant onKeyDown here would just re-trigger the same close. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape (via Radix) is the keyboard equivalent to this backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      <button
        type="button"
        onClick={onClose}
        aria-label="Close image viewer"
        className="absolute top-4 right-4 md:top-6 md:right-6 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
      >
        <IoClose className="text-2xl" />
      </button>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: only stops the click from bubbling to the backdrop's close handler, not an action of its own */}
      <div
        className="relative z-10 flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={src}
          alt={alt}
          width={1200}
          height={1200}
          className={cn(
            "object-contain w-auto h-auto max-w-[92vw] max-h-[85dvh] rounded-md transition-opacity duration-200",
            hasError && "invisible",
          )}
          style={{ opacity: isLoading ? 0 : 1 }}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          priority
        />

        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-4 border-white border-t-transparent animate-spin rounded-full w-12 h-12" />
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-white px-6">
            Couldn't load this image.
          </div>
        )}
      </div>
    </ModalShell>
  );
}
