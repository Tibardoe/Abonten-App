"use client";

import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useEffect, useRef } from "react";
import { MdClose } from "react-icons/md";
import { cn } from "../lib/utils";

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

// Shared iPhone-inspired picker shell: slides up from the bottom on mobile
// (matching FilterModalPopup's own bottom-sheet convention) and settles into
// a small centered panel on desktop, instead of every picker (date, date
// range) reinventing its own overlay/focus/scroll-lock handling. Kept
// intentionally lighter than a full dialog primitive -- no Radix Dialog
// dependency exists in this repo yet, and this only needs to trap Escape and
// return focus, not the full modal stack behavior a generic Dialog would add.
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement;
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-overlay/40"
      />

      {/* Rendered open (no showModal()) so it stays in normal flow, sized
          and positioned by this wrapper, instead of the browser's top-layer
          ::backdrop -- the backdrop button above already does that job. */}
      <dialog
        ref={panelRef}
        open
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "relative m-0 flex max-h-[85dvh] w-full max-w-none flex-col rounded-t-2xl border-none bg-card p-0 text-card-foreground shadow-lg outline-none md:max-h-[80dvh] md:w-[26rem] md:rounded-xl",
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <MdClose className="text-xl" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-border px-4 py-3">
            {footer}
          </div>
        )}
      </dialog>
    </div>
  );
}
