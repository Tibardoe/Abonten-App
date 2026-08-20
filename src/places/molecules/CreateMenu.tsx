"use client";

import { cn } from "@/components/lib/utils";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useEffect, useRef, useState } from "react";
import { GiPartyFlags } from "react-icons/gi";
import { IoCreateOutline, IoStorefrontOutline } from "react-icons/io5";

type CreateMenuProps = {
  label: string;
  onSelectEvent: () => void;
  onSelectPlace: () => void;
  triggerClassName?: string;
  iconClassName?: string;
};

// Replacement for the old bare "Post" button at both nav trigger points
// (EventUploadButton.tsx for desktop, SideBar.tsx for mobile): a small
// anchored popover letting the owner choose between creating an Event
// (existing flow, unchanged) or a Place (new — Places feature Milestone 3).
// Hand-rolled rather than a shadcn Dialog/DropdownMenu — neither exists in
// this codebase; every existing overlay here is a custom absolute/fixed
// positioned div. This component only reports which type was chosen — it
// doesn't know about file pickers or modals, so each call site keeps its
// own trigger logic and just adds a Place branch.
export default function CreateMenu({
  label,
  onSelectEvent,
  onSelectPlace,
  triggerClassName,
  iconClassName = "text-2xl",
}: CreateMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside([containerRef], () => setOpen(false));

  // Keyboard-dismissible in addition to click-outside, per the Places
  // accessibility spec -- same "Escape closes an open overlay" expectation
  // as every other custom popover/modal in this codebase.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const select = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        className={cn("flex gap-1 items-center", triggerClassName)}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <IoCreateOutline className={iconClassName} />
        {label}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 z-40 w-44 rounded-md border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
            onClick={() => select(onSelectEvent)}
          >
            <GiPartyFlags className="text-lg" />
            Event
          </button>

          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
            onClick={() => select(onSelectPlace)}
          >
            <IoStorefrontOutline className="text-lg" />
            Place
          </button>
        </div>
      )}
    </div>
  );
}
