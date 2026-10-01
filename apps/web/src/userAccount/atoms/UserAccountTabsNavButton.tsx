"use client";

import MaskIcon from "@/components/atoms/MaskIcon";
import { cn } from "@/components/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

type TabsNavButtonProp = {
  imgUrl: string;
  text: string;
  username: string;
  // Route segment this tab links to: /user/[username]/<path>. Always
  // given, never worked out from the label: the label is translated
  // ("Lieux", "Favoris", "Avis"), and a link built from it led French,
  // Spanish, German and Portuguese readers to a page that does not exist.
  path: "posts" | "places" | "spotlight" | "favorites" | "reviews";
};

export default function UserAccountTabsNavButton({
  imgUrl,
  text,
  username,
  path,
}: TabsNavButtonProp) {
  const pathname = usePathname();

  const href = `/user/${username}/${path}`;
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      type="button"
      className={cn(
        "flex flex-col sm:flex-row gap-1 sm:gap-3 items-center p-2 sm:p-3 shrink-0",
        isActive ? "border-t-2 border-primary font-bold" : "border-transparent",
      )}
    >
      <MaskIcon
        src={imgUrl}
        alt={text}
        className="w-[22px] h-[22px] sm:w-[30px] sm:h-[30px]"
      />
      <p className="text-xs sm:text-md lg:text-lg">{text}</p>
    </Link>
  );
}
