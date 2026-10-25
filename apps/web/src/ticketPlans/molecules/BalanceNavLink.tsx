"use client";

import { useTicketPlanNav } from "@/hooks/useTicketPlanNav";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { IoWalletOutline } from "react-icons/io5";

// Shown once Pay small small is open to this person, or while they have a
// plan running (switching the programme off never hides someone's plan).
export default function BalanceNavLink({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const t = useTranslations("navigation");
  const { nav } = useTicketPlanNav();
  if (!nav.enabled && nav.openPlans === 0) return null;

  return (
    <Link
      href="/balance"
      onClick={onNavigate}
      className={
        className ??
        "flex items-center gap-1 transition-colors hover:text-primary"
      }
    >
      <IoWalletOutline className="text-2xl opacity-70" />
      {t("balance")}
    </Link>
  );
}
