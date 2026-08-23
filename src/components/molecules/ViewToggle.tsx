"use client";

import { cn } from "@/components/lib/utils";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { IoGridOutline, IoMapOutline } from "react-icons/io5";

// List/Map toggle shared by the Explore page's Places and Events tabs.
// Reads the live searchParams (rather than reconstructing a URL from
// individual filter props) so toggling the view never drops a filter this
// component doesn't itself know about (category/openNow/rating/distance/q
// for Places; eventCategory for Events) — only "view" changes.
export default function ViewToggle({ view }: { view: "list" | "map" }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function hrefFor(target: "list" | "map") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", target);
    return `${pathname}?${params.toString()}`;
  }

  const options: {
    value: "list" | "map";
    label: string;
    icon: typeof IoGridOutline;
  }[] = [
    { value: "list", label: "List", icon: IoGridOutline },
    { value: "map", label: "Map", icon: IoMapOutline },
  ];

  return (
    <div className="inline-flex shrink-0 gap-1 rounded-full border border-border bg-muted p-1">
      {options.map(({ value, label, icon: Icon }) => (
        <Link
          key={value}
          href={hrefFor(value)}
          scroll={false}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1 rounded-full text-sm transition-colors",
            view === value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent",
          )}
        >
          <Icon className="text-base" />
          {label}
        </Link>
      ))}
    </div>
  );
}
