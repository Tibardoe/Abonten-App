"use client";

import type { AdminPermissionKey } from "@abonten/types/adminTypes";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Clapperboard,
  ClipboardCheck,
  ClipboardList,
  Compass,
  Flag,
  Gift,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  MapPinned,
  Menu,
  Newspaper,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  Store,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "./ui";

type Item = {
  href: string;
  label: string;
  icon: typeof Flag;
  permission: AdminPermissionKey;
};

const ITEMS: Item[] = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    permission: "dashboard.view",
  },
  {
    href: "/reports",
    label: "Reports & moderation",
    icon: Flag,
    permission: "reports.view",
  },
  {
    href: "/content",
    label: "Content",
    icon: ShieldAlert,
    permission: "reviews.view",
  },
  {
    href: "/claims",
    label: "Claims",
    icon: ClipboardCheck,
    permission: "claims.view",
  },
  {
    href: "/verification",
    label: "Verification",
    icon: ShieldCheck,
    permission: "verification.view",
  },
  {
    href: "/support",
    label: "Support",
    icon: LifeBuoy,
    permission: "support.view",
  },
  {
    href: "/blocks",
    label: "Blocked users",
    icon: ShieldBan,
    permission: "users.view",
  },
  { href: "/users", label: "Users", icon: Users, permission: "users.view" },
  {
    href: "/organizers",
    label: "Organizers",
    icon: Building2,
    permission: "organizers.view",
  },
  {
    href: "/events",
    label: "Events",
    icon: CalendarDays,
    permission: "events.view",
  },
  { href: "/places", label: "Places", icon: Store, permission: "places.view" },
  {
    href: "/finance",
    label: "Finance",
    icon: Wallet,
    permission: "finance.view",
  },
  {
    href: "/rewards",
    label: "Rewards",
    icon: Gift,
    permission: "rewards.view",
  },
  {
    href: "/field-ops",
    label: "Field Ops",
    icon: MapPinned,
    permission: "fieldops.view",
  },
  {
    href: "/discovery",
    label: "Discovery",
    icon: Compass,
    permission: "discovery.view",
  },
  {
    href: "/spotlight",
    label: "Spotlight & Stories",
    icon: Clapperboard,
    permission: "spotlight.view",
  },
  {
    href: "/weekly",
    label: "Abonten Weekly",
    icon: Newspaper,
    permission: "weekly.view",
  },
  {
    href: "/markets",
    label: "Markets",
    icon: Globe,
    permission: "markets.view",
  },
  {
    href: "/notifications",
    label: "Notifications",
    icon: Bell,
    permission: "notifications.view",
  },
  {
    href: "/monitoring",
    label: "Monitoring",
    icon: Activity,
    permission: "monitoring.view",
  },
  {
    href: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    permission: "analytics.view",
  },
  {
    href: "/audit",
    label: "Audit logs",
    icon: ScrollText,
    permission: "audit.view",
  },
  {
    href: "/settings",
    label: "Admin settings",
    icon: Settings,
    permission: "settings.view",
  },
];

// The console's navigation. On a wide screen it is a fixed column; under
// `lg` it folds behind a button in the header and slides in over the page,
// so the console is usable on a phone — an operator checking a stuck payment
// from the road should not have to pinch-zoom a 224px sidebar out of the way.
//
// Escape closes it and returns focus to the button that opened it, and the
// page behind is marked inert while it is open, so keyboard and
// screen-reader users are not left tabbing through hidden content.

export function Sidebar({
  permissions,
}: { permissions: AdminPermissionKey[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const visible = ITEMS.filter((i) => permissions.includes(i.permission));

  // Keep the current section in view when the list is scrolled (e.g. landing
  // on Admin settings, at the bottom of the list, on a short screen).
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname and open are the triggers
  useEffect(() => {
    for (const list of document.querySelectorAll<HTMLElement>(
      "[data-console-nav-list]",
    )) {
      list
        .querySelector<HTMLElement>('[aria-current="page"]')
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [pathname, open]);

  // Navigating closes the drawer; so does Escape.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname change is the trigger
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // The same list is rendered twice — as the fixed column and inside the
  // drawer — so each copy needs its own id, or the page carries a duplicate
  // id and the toggle's aria-controls points at the hidden copy.
  const nav = (id: string) => (
    <nav
      id={id}
      aria-label="Console sections"
      className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-card py-4"
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2 px-5">
        <span className="flex items-center gap-2 font-semibold">
          <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
          Abonten Admin
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            toggleRef.current?.focus();
          }}
          aria-label="Close navigation"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {/* The section list outgrows short screens (22 sections today), and the
          console layout is h-screen with overflow hidden, so the list scrolls
          on its own under the fixed title. */}
      <div
        data-console-nav-list
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 pb-2"
      >
        {visible.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );

  return (
    <>
      {/* Wide screens: always visible. */}
      <div className="hidden h-full lg:block">{nav("console-nav")}</div>

      {/* Narrow screens: a button in the header and an off-canvas drawer. */}
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        aria-controls="console-nav-drawer"
        className="fixed left-3 top-2 z-40 rounded-md border border-border bg-card p-1.5 text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
      >
        <Menu className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled at the document level */}
          <div
            className="absolute inset-0 bg-foreground/30 motion-safe:animate-in motion-safe:fade-in"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative h-full motion-safe:animate-in motion-safe:slide-in-from-left motion-safe:duration-150">
            {nav("console-nav-drawer")}
          </div>
        </div>
      ) : null}
    </>
  );
}
