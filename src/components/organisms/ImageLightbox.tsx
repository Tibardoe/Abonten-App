"use client";

import { cn } from "@/components/lib/utils";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import usePrefersReducedMotion from "@/hooks/usePrefersReducedMotion";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { IoClose } from "react-icons/io5";

type ImageLightboxProps = {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
};

const EXIT_ANIMATION_MS = 150;

// Reusable full-screen image viewer — used today for profile pictures
// (public profile + Edit Profile), but generic enough for any future
// "tap an image to see it larger" need. Deliberately hand-rolled rather
// than a Radix/shadcn Dialog: no @radix-ui/react-dialog is installed in
// this repo, and every existing full-screen overlay here (HighlightViewer,
// AvatarUploadModal, ConfirmDeleteModal) already follows this same
// fixed-overlay + useBodyScrollLock convention, so this matches established
// patterns instead of introducing a new dependency.
export default function ImageLightbox({
  src,
  alt,
  open,
  onClose,
}: ImageLightboxProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  // Kept mounted slightly past `open` becoming false so the exit animation
  // can play — see the effect below.
  const [shouldRender, setShouldRender] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(shouldRender);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only `open` should retrigger this — shouldRender/prefersReducedMotion are read, not depended on
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current =
        document.activeElement as HTMLElement | null;
      setShouldRender(true);
      setIsClosing(false);
      setIsLoading(true);
      setHasError(false);
      return;
    }

    if (!shouldRender) return;

    if (prefersReducedMotion) {
      setShouldRender(false);
      previouslyFocusedRef.current?.focus?.();
      return;
    }

    setIsClosing(true);
    const timeout = setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
      previouslyFocusedRef.current?.focus?.();
    }, EXIT_ANIMATION_MS);

    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!shouldRender) return;

    closeButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // The close button is the only focusable element in this dialog, so
      // trapping focus just means Tab/Shift+Tab never leave it.
      if (e.key === "Tab") {
        e.preventDefault();
        closeButtonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [shouldRender, onClose]);

  if (!shouldRender) return null;

  return (
    // Clicking the backdrop is a mouse/touch convenience on top of an
    // already-adequate keyboard path (Escape, handled via the document
    // listener above) — a redundant onKeyDown here would just re-trigger
    // the same close. A native <dialog> isn't used because this needs to
    // sit inline in the DOM like every other overlay in this codebase
    // (HighlightViewer, ConfirmDeleteModal), not the top layer <dialog>
    // forces content into.
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape (below) is the keyboard equivalent to this backdrop click
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-overlay/90 p-4",
        "pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
        !prefersReducedMotion &&
          (isClosing
            ? "animate-out fade-out duration-150"
            : "animate-in fade-in duration-200"),
      )}
      // biome-ignore lint/a11y/useSemanticElements: a native <dialog> isn't used — see comment above
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label="Close image viewer"
        className="absolute top-4 right-4 md:top-6 md:right-6 z-10 flex items-center justify-center w-10 h-10 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
      >
        <IoClose className="text-2xl" />
      </button>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: only stops the click from bubbling to the backdrop's close handler, not an action of its own */}
      <div
        className={cn(
          "relative flex items-center justify-center",
          !prefersReducedMotion &&
            (isClosing
              ? "animate-out zoom-out-95 fade-out duration-150"
              : "animate-in zoom-in-95 fade-in duration-200"),
        )}
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
    </div>
  );
}
