"use client";

import { SPOTLIGHT_PRODUCT_NAME } from "@abonten/core/content/copy";
import Link from "next/link";
import { IoPlayCircleOutline } from "react-icons/io5";
import { useContentProgram } from "../hooks/useContentProgram";

// Shown only once Spotlight is switched on for this visitor, so the rollout
// switch in the admin console controls every entry point at once.
export default function SpotlightNavLink({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const { program } = useContentProgram();
  if (!program.spotlight) return null;

  return (
    <Link
      href="/spotlight"
      onClick={onNavigate}
      className={
        className ??
        "flex items-center gap-1 transition-colors hover:text-primary"
      }
    >
      <IoPlayCircleOutline aria-hidden className="text-2xl opacity-70" />
      {SPOTLIGHT_PRODUCT_NAME}
    </Link>
  );
}
