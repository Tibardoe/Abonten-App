"use client";

import { cn } from "@/components/lib/utils";
import { useClickOutside } from "@/hooks/useClickOutside";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  IoCalendarNumberOutline,
  IoCalendarOutline,
  IoStorefrontOutline,
} from "react-icons/io5";
import { MdOutlineManageHistory } from "react-icons/md";

type ManageMenuProps = {
  username: string;
  triggerClassName?: string;
};

// Own-profile "Manage" entry point, replacing the perceived "Manage
// Attendance" button on this page. Mirrors CreateMenu.tsx's hand-rolled
// popover exactly (this codebase has no Radix DropdownMenu): a relative
// trigger button, click-outside/Escape to close, an absolute role="menu"
// panel of role="menuitem" links.
export default function ManageMenu({
  username,
  triggerClassName,
}: ManageMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside([containerRef], () => setOpen(false));

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        className={cn("flex gap-1 items-center", triggerClassName)}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Manage"
      >
        <MdOutlineManageHistory className="text-2xl" />
        <span className="hidden sm:inline">Manage</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-40 w-48 rounded-md border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden"
        >
          <Link
            href="/manage/attendance/event-list"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
          >
            <MdOutlineManageHistory className="text-lg" />
            Attendance
          </Link>

          <Link
            href="/manage/events"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
          >
            <IoCalendarNumberOutline className="text-lg" />
            Events
          </Link>

          <Link
            href="/manage/places"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
          >
            <IoStorefrontOutline className="text-lg" />
            Places
          </Link>

          <Link
            href={`/user/${username}/bookings`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
          >
            <IoCalendarOutline className="text-lg" />
            Bookings
          </Link>
        </div>
      )}
    </div>
  );
}
