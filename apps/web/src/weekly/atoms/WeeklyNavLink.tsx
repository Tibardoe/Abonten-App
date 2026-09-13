"use client";

import { useWeeklyProgram } from "@/hooks/useWeeklyProgram";
import { WEEKLY_PRODUCT_NAME } from "@abonten/core/weekly/copy";
import Link from "next/link";
import { IoSparklesOutline } from "react-icons/io5";

// Shown only once Abonten Weekly is switched on for this visitor, so the
// rollout switch in the admin console controls every entry point at once.
export default function WeeklyNavLink({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const { program } = useWeeklyProgram();
  if (!program.enabled) return null;

  return (
    <Link
      href="/weekly"
      onClick={onNavigate}
      className={
        className ??
        "flex items-center gap-1 transition-colors hover:text-primary"
      }
    >
      <IoSparklesOutline aria-hidden className="text-2xl opacity-70" />
      {WEEKLY_PRODUCT_NAME}
    </Link>
  );
}
