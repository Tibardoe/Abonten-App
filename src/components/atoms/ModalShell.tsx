"use client";

import usePrefersReducedMotion from "@/hooks/usePrefersReducedMotion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";

type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name for screen readers -- visually hidden, since every
   * caller already renders its own visible heading inside `children`. */
  title: string;
  children: ReactNode;
  /** Full override of the foreground panel's positioning/sizing/background
   * classes (each caller already had its own bespoke panel shape before
   * this shell existed -- centered card, full-screen-on-mobile takeover,
   * near-full-bleed media viewer -- so this is deliberately unopinionated
   * rather than offering a fixed set of size variants). */
  className?: string;
  /** Overrides the default bg-overlay/50 backdrop -- only the full-bleed
   * media viewers (ImageLightbox, HighlightViewer) need a near-opaque
   * bg-overlay/90 instead. */
  overlayClassName?: string;
};

const DEFAULT_PANEL_CLASS =
  "fixed inset-0 z-50 flex items-center justify-center outline-none";
const DEFAULT_OVERLAY_CLASS = "fixed inset-0 z-50 bg-overlay/50";

/**
 * Thin Radix Dialog wrapper standing in for the hand-rolled
 * `fixed inset-0 bg-overlay/50 ...` shell every modal in this app used to
 * write out by hand. Deliberately renders no header/close button of its own
 * (unlike BottomSheet.tsx) -- every caller already has its own heading and
 * close affordance in `children`, so this only replaces the outer
 * overlay/portal/focus-trap plumbing, never the visible content.
 *
 * Every real modal overlay (bg-overlay/50) now comes from one place
 * (this file), so it can never drift out of sync the way ~15 hand-copied
 * `fixed ... bg-overlay/NN z-NN` divs previously could. Respects
 * prefers-reduced-motion once, here, instead of every caller needing its
 * own usePrefersReducedMotion() check for its entrance/exit transition.
 */
export default function ModalShell({
  open,
  onClose,
  title,
  children,
  className,
  overlayClassName,
}: ModalShellProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const animationClasses = prefersReducedMotion
    ? ""
    : "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            DEFAULT_OVERLAY_CLASS,
            animationClasses,
            overlayClassName,
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(DEFAULT_PANEL_CLASS, animationClasses, className)}
        >
          <DialogPrimitive.Title className="sr-only">
            {title}
          </DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
