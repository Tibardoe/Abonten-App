"use client";

import { useRewardsProgram } from "@/hooks/useRewardsProgram";
import Link from "next/link";
import { IoGiftOutline } from "react-icons/io5";

// Shown only once Rewards is switched on for this user, so the rollout
// switch in the admin console controls every entry point at once.
export default function RewardsNavLink({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const { data } = useRewardsProgram();
  if (!data?.enabled) return null;

  return (
    <Link
      href="/rewards"
      onClick={onNavigate}
      className={
        className ??
        "flex items-center gap-1 transition-colors hover:text-primary"
      }
    >
      <IoGiftOutline className="text-2xl opacity-70" />
      Rewards
    </Link>
  );
}
