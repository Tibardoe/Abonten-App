"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconType } from "react-icons";
import { cn } from "../lib/utils";

type MobileNavButtonProp = {
  text: string;
  href: string;
  Icon: IconType;
  /** Small unread count shown on the icon (e.g. Messages). */
  badge?: number;
  /** Light up for any path under this prefix (Home's href carries an area). */
  activePrefix?: string;
};

export default function MobileNavButton({
  text,
  href,
  Icon,
  badge,
  activePrefix,
}: MobileNavButtonProp) {
  const pathname = usePathname();
  // Highlight when the tab's own path or any child of it is active, so
  // /messages/<id> still lights the Messages tab.
  const active = activePrefix
    ? pathname.startsWith(activePrefix)
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center text-sidebar-foreground opacity-50",
        {
          "opacity-100 font-bold text-primary": active,
        },
      )}
    >
      <span className="relative">
        <Icon className="text-xl" />
        {badge && badge > 0 ? (
          <span
            aria-hidden
            className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-medium leading-none text-destructive-foreground"
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      <p className="text-xs">{text}</p>
    </Link>
  );
}
