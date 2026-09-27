"use client";

import { rememberExploreArea } from "@/utils/exploreArea";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Rendered on /explore/<area>: remembers this area (and its coordinates,
// for "current location") as the one to come back to. Filters and tabs are
// left out — they belong to this visit, not to the area.
export default function RememberExploreArea() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  useEffect(() => {
    const coords =
      lat && lng ? `?${new URLSearchParams({ lat, lng }).toString()}` : "";
    rememberExploreArea(`${pathname}${coords}`);
  }, [pathname, lat, lng]);

  return null;
}
