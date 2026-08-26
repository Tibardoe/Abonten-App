"use client";

import { cn } from "@/components/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GiPartyFlags } from "react-icons/gi";
import {
  IoCalendarNumberOutline,
  IoCalendarOutline,
  IoStorefrontOutline,
} from "react-icons/io5";
import {
  MdOutlineAccountBalanceWallet,
  MdOutlineDrafts,
  MdOutlineManageHistory,
  MdOutlineSpaceDashboard,
} from "react-icons/md";

type ManageMenuProps = {
  username: string;
  isOrganizer: boolean;
  isPlaceOwner: boolean;
  triggerClassName?: string;
  onNavigate?: () => void;
};

// Single entry point for everything management-related, grouped by what
// it's for rather than split between this menu and flat top-level header
// links (the previous layout had Dashboard/Finances/My Events/Drafts as
// separate links right next to this menu, with no clear rule for what
// belonged where). Built on shadcn/Radix DropdownMenu, which gives real
// focus trapping, arrow-key navigation, and typeahead for free instead of
// the hand-rolled click-outside/Escape popover this used to be.
export default function ManageMenu({
  username,
  isOrganizer,
  isPlaceOwner,
  triggerClassName,
  onNavigate,
}: ManageMenuProps) {
  const t = useTranslations("navigation");
  const pathname = usePathname();

  const isDashboardActive = pathname.startsWith("/manage/dashboard");
  const isFinancesActive = pathname.startsWith("/finances");
  const isEventsActive = pathname.startsWith("/manage/events");
  const isPlacesActive = pathname.startsWith("/manage/places");
  const isMyEventsActive = pathname.startsWith("/manage/my-events");
  const isDraftsActive = pathname.startsWith("/manage/drafts");
  const isBookingsActive = pathname.startsWith(`/user/${username}/bookings`);

  const isManageActive =
    isDashboardActive ||
    isFinancesActive ||
    isEventsActive ||
    isPlacesActive ||
    isMyEventsActive ||
    isDraftsActive ||
    isBookingsActive;

  const itemClass = (active: boolean) => cn("gap-2", active && "text-primary");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex gap-1 items-center",
            isManageActive && "text-primary",
            triggerClassName,
          )}
        >
          <MdOutlineManageHistory className="text-2xl" />
          {t("manage")}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52">
        {isOrganizer && (
          <>
            <DropdownMenuItem asChild>
              <Link
                href="/manage/dashboard"
                onClick={onNavigate}
                className={itemClass(isDashboardActive)}
              >
                <MdOutlineSpaceDashboard className="text-lg" />
                {t("dashboard")}
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link
                href="/finances"
                onClick={onNavigate}
                className={itemClass(isFinancesActive)}
              >
                <MdOutlineAccountBalanceWallet className="text-lg" />
                {t("finances")}
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {(isOrganizer || isPlaceOwner) && <DropdownMenuSeparator />}

        {isOrganizer && (
          <DropdownMenuItem asChild>
            <Link
              href="/manage/events"
              onClick={onNavigate}
              className={itemClass(isEventsActive)}
            >
              <IoCalendarNumberOutline className="text-lg" />
              {t("manageEvents")}
            </Link>
          </DropdownMenuItem>
        )}

        {isPlaceOwner && (
          <DropdownMenuItem asChild>
            <Link
              href="/manage/places"
              onClick={onNavigate}
              className={itemClass(isPlacesActive)}
            >
              <IoStorefrontOutline className="text-lg" />
              {t("places")}
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link
            href="/manage/my-events"
            onClick={onNavigate}
            className={itemClass(isMyEventsActive)}
          >
            <GiPartyFlags className="text-lg" />
            {t("myEvents")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href="/manage/drafts"
            onClick={onNavigate}
            className={itemClass(isDraftsActive)}
          >
            <MdOutlineDrafts className="text-lg" />
            {t("drafts")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link
            href={`/user/${username}/bookings`}
            onClick={onNavigate}
            className={itemClass(isBookingsActive)}
          >
            <IoCalendarOutline className="text-lg" />
            {t("bookings")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
