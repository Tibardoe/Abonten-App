"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { IconType } from "react-icons";
import { cn } from "../lib/utils";

type MobileNavButtonProp = {
  text: string;
  href: string;
  Icon: IconType;
  onClick?: (e: React.MouseEvent) => void;
};

export default function MobileNavButton({
  text,
  href,
  Icon,
  onClick,
}: MobileNavButtonProp) {
  const pathname = usePathname();

  return (
    <Link
      href={href}
      type="button"
      onClick={onClick}
      className={cn("flex flex-col items-center opacity-50", {
        "opacity-100 font-bold text-mint": pathname === href,
      })}
    >
      <Icon className="text-xl" />
      <p className="text-xs">{text}</p>
    </Link>
  );
}
