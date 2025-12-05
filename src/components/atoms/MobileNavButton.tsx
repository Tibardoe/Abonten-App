"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../lib/utils";

type MobileNavButtonProp = {
  imgUrl: string;
  text: string;
  href: string;
  onClick?: (e: React.MouseEvent) => void;
};

export default function MobileNavButton({
  imgUrl,
  text,
  href,
  onClick,
}: MobileNavButtonProp) {
  const pathname = usePathname();

  return (
    <Link
      href={href}
      type="button"
      onClick={onClick}
      className={cn("flex flex-col items-center opacity-50", {
        "opacity-100 font-semibold": pathname === href,
      })}
    >
      <Image src={imgUrl} alt="text" height={25} width={25} />
      <p className="text-xs">{text}</p>
    </Link>
  );
}
