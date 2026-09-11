"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useFieldOpsMe } from "@/hooks/useFieldOpsMe";
import Link from "next/link";
import { IoMapOutline } from "react-icons/io5";

// "Field work" appears only for people on a Field Ops team while the
// programme is switched on, so the admin switch controls every entry point.
export default function FieldOpsNavLink({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const { data: user } = useCurrentUser();
  const { data } = useFieldOpsMe();
  if (!user || !data?.programEnabled || !data.current) return null;

  return (
    <Link
      href="/field"
      onClick={onNavigate}
      className={
        className ??
        "flex items-center gap-1 transition-colors hover:text-primary"
      }
    >
      <IoMapOutline className="text-2xl opacity-70" />
      Field work
    </Link>
  );
}
