"use client";

import MaskIcon from "@/components/atoms/MaskIcon";
import { cn } from "@/components/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

type TabsNavButtonProp = {
  imgUrl: string;
  text: string;
  username: string;
};

export default function UserAccountTabsNavButton({
  imgUrl,
  text,
  username,
}: TabsNavButtonProp) {
  const pathname = usePathname();

  const href = `/user/${username}/${text.toLowerCase()}`;
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      type="button"
      className={cn(
        "flex gap-3 items-center p-3",
        isActive ? "border-t-2 border-primary font-bold" : "border-transparent",
      )}
    >
      <MaskIcon src={imgUrl} alt={text} className="w-[30px] h-[30px]" />
      <p className="md:text-md lg:text-lg">{text}</p>
    </Link>
  );
}
