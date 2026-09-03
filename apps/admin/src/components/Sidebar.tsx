"use client";

import type { AdminPermissionKey } from "@abonten/types/adminTypes";
import {
  Activity,
  ClipboardList,
  Flag,
  LayoutDashboard,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

type Item = {
  href: string;
  label: string;
  icon: typeof Flag;
  permission: AdminPermissionKey;
};

const ITEMS: Item[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/reports", label: "Reports & Moderation", icon: Flag, permission: "reports.view" },
  { href: "/users", label: "Users", icon: Users, permission: "users.view" },
  { href: "/monitoring", label: "Monitoring", icon: Activity, permission: "monitoring.view" },
  { href: "/audit", label: "Audit Logs", icon: ScrollText, permission: "audit.view" },
  { href: "/settings", label: "Admin Settings", icon: Settings, permission: "settings.view" },
];

const SOON = ["Finance", "Claims", "Events", "Places", "Analytics"];

export function Sidebar({ permissions }: { permissions: AdminPermissionKey[] }) {
  const pathname = usePathname();
  const visible = ITEMS.filter((i) => permissions.includes(i.permission));

  return (
    <nav className="flex h-full w-56 shrink-0 flex-col gap-1 border-r border-border bg-card px-3 py-4">
      <div className="mb-3 flex items-center gap-2 px-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <span className="font-semibold">Abonten Admin</span>
      </div>
      {visible.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}

      <div className="mt-4 border-t border-border pt-3">
        <p className="px-2.5 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Later phases
        </p>
        {SOON.map((s) => (
          <div
            key={s}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground/50"
          >
            {s}
            <span className="text-[9px]">soon</span>
          </div>
        ))}
      </div>
    </nav>
  );
}
