"use client";

import { readExploreArea } from "@/utils/exploreArea";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Where "Explore" should go: the area this visitor last explored, else the
 * area chooser at /explore. Starts at /explore on the server and first
 * client render (no hydration mismatch), then picks up the remembered area;
 * re-reads on navigation, so visiting a new area updates every link.
 */
export function useExploreHref(): string {
  const pathname = usePathname();
  const [href, setHref] = useState("/explore");

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read the remembered area after each navigation
  useEffect(() => {
    setHref(readExploreArea() ?? "/explore");
  }, [pathname]);

  return href;
}
