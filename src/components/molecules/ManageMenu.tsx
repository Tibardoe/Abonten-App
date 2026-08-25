"use client";

import { cn } from "@/components/lib/utils";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { IoCalendarNumberOutline, IoCalendarOutline } from "react-icons/io5";
import { IoStorefrontOutline } from "react-icons/io5";
import { MdOutlineManageHistory } from "react-icons/md";

type ManageMenuProps = {
  username: string;
  isOrganizer: boolean;
  isPlaceOwner: boolean;
  triggerClassName?: string;
  onNavigate?: () => void;
};

// Primary "Manage" entry point for the desktop header and mobile sidebar,
// replacing the old flat Manage Attendance/Events/Places links and the
// profile-only ManageMenu. Mirrors CreateMenu.tsx's hand-rolled popover
// exactly (this codebase has no Radix DropdownMenu): a relative trigger
// button, click-outside/Escape to close, an absolute role="menu" panel of
// role="menuitem" links.
export default function ManageMenu({
  username,
  isOrganizer,
  isPlaceOwner,
  triggerClassName,
  onNavigate,
}: ManageMenuProps) {
  const t = useTranslations("navigation");
  const pathname = usePathname();
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

  const isEventsActive = pathname.startsWith("/manage/events");
  const isPlacesActive = pathname.startsWith("/manage/places");
  const isManageActive = isEventsActive || isPlacesActive;

  const close = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        className={cn(
          "flex gap-1 items-center",
          isManageActive && "text-primary",
          triggerClassName,
        )}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MdOutlineManageHistory className="text-2xl" />
        {t("manage")}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 z-40 w-48 rounded-md border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden"
        >
          {isOrganizer && (
            <Link
              href="/manage/events"
              role="menuitem"
              onClick={close}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent",
                isEventsActive && "text-primary",
              )}
            >
              <IoCalendarNumberOutline className="text-lg" />
              {t("manageEvents")}
            </Link>
          )}

          {isPlaceOwner && (
            <Link
              href="/manage/places"
              role="menuitem"
              onClick={close}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent",
                isPlacesActive && "text-primary",
              )}
            >
              <IoStorefrontOutline className="text-lg" />
              {t("places")}
            </Link>
          )}

          <Link
            href={`/user/${username}/bookings`}
            role="menuitem"
            onClick={close}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
          >
            <IoCalendarOutline className="text-lg" />
            {t("bookings")}
          </Link>
        </div>
      )}
    </div>
  );
}
