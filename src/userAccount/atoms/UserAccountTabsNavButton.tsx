"use client";

import { cn } from "@/components/lib/utils";
import Image from "next/image";
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
        isActive ? "border-t-2 border-black font-bold" : "border-transparent",
      )}
    >
      <Image src={imgUrl} alt="text" height={30} width={30} />
      <p className="md:text-md lg:text-lg">{text}</p>
    </Link>
  );
}
