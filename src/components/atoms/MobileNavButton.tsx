"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../lib/utils";

type MobileNavButtonProp = {
  imgUrl: string;
  text: string;
  href: string;
};

export default function MobileNavButton({
  imgUrl,
  text,
  href,
}: MobileNavButtonProp) {
  const pathname = usePathname();

  return (
    <Link
      href={href}
      type="button"
      className={cn("flex flex-col items-center opacity-50", {
        "opacity-100 font-semibold": pathname === href,
      })}
    >
      <Image src={imgUrl} alt="text" height={30} width={30} />
      <p className="text-sm">{text}</p>
    </Link>
  );
}
