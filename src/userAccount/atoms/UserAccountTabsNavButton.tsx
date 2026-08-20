"use client";

import MaskIcon from "@/components/atoms/MaskIcon";
import { cn } from "@/components/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

type TabsNavButtonProp = {
  imgUrl: string;
  text: string;
  username: string;
  // Route segment this tab links to, when it differs from the display
  // label (e.g. the "Events" tab's label was renamed from "Posts" per the
  // Places spec, but the underlying route is still /user/[username]/posts
  // -- renaming the route itself would break existing links/bookmarks for
  // no user-facing benefit). Defaults to the lowercased label.
  path?: string;
};

export default function UserAccountTabsNavButton({
  imgUrl,
  text,
  username,
  path,
}: TabsNavButtonProp) {
  const pathname = usePathname();

  const href = `/user/${username}/${path ?? text.toLowerCase()}`;
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
