"use client";

import { cn } from "@/components/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type SettingsNavLinkProps = {
  text: string;
  href: string;
  imgUrl: string;
  arrowUrl: string;
};

export default function SettingsNavLinks({
  text,
  href,
  imgUrl,
  arrowUrl,
}: SettingsNavLinkProps) {
  const pathname = usePathname();

  const isActive = pathname === href || pathname.startsWith(href);

  return (
    <div
      className={cn(
        "flex w-full justify-between items-center p-2 rounded-l-full",
        {
          "font-bold": isActive,
        },
      )}
    >
      <Link type="button" className="gap-3 items-center flex" href={href}>
        <Image
          src={imgUrl}
          alt={`${text} icon`}
          width={40}
          height={40}
          className="w-8 h-8 md:w-10 md:h-10"
        />
        <p className="text-lg">{text}</p>
      </Link>

      <Link href={href} className="flex lg:hidden">
        <Image src={arrowUrl} alt={`${text} icon`} width={30} height={30} />
      </Link>
    </div>
  );
}
