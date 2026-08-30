"use client";

import MaskIcon from "@/components/atoms/MaskIcon";
import { cn } from "@/components/lib/utils";
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
        "flex w-full justify-between items-center p-2 rounded-l-full transition-colors hover:bg-accent",
        {
          "font-bold bg-accent text-accent-foreground": isActive,
          "text-foreground": !isActive,
        },
      )}
    >
      <Link type="button" className="gap-3 items-center flex" href={href}>
        <MaskIcon
          src={imgUrl}
          alt={`${text} icon`}
          className="w-8 h-8 md:w-10 md:h-10"
        />
        <p className="text-lg">{text}</p>
      </Link>

      <Link href={href} className="flex lg:hidden">
        <MaskIcon
          src={arrowUrl}
          alt={`${text} icon`}
          className="w-[30px] h-[30px]"
        />
      </Link>
    </div>
  );
}
