"use client";

import { cn } from "@/components/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useContentProgram } from "@/spotlight/hooks/useContentProgram";
import {
  useActingContext,
  useSwitchActingTeam,
} from "@/teams/useActingContext";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GiPartyFlags } from "react-icons/gi";
import {
  IoCalendarNumberOutline,
  IoCalendarOutline,
  IoPlayCircleOutline,
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
  const tt = useTranslations("teams");
  const pathname = usePathname();
  // "Managing as": the person's own account or one of their teams. With a
  // team chosen, the menu offers only what the person's role covers there;
  // money, Spotlight and the dashboard follow in later stages.
  const acting = useActingContext();
  const switchTeam = useSwitchActingTeam();
  const team = acting.current;
  const showOrganizer = team
    ? acting.can("events.manage", "attendees.view", "checkin.scan")
    : isOrganizer;
  const showPlaces = team
    ? acting.can("places.manage", "bookings.manage", "visit.show")
    : isPlaceOwner;
  const showMoney = !team && isOrganizer;
  const showDrafts = !team || acting.can("events.manage", "places.manage");

  const isDashboardActive = pathname.startsWith("/manage/dashboard");
  const isFinancesActive = pathname.startsWith("/finances");
  const isEventsActive = pathname.startsWith("/manage/events");
  const isPlacesActive = pathname.startsWith("/manage/places");
  const isMyEventsActive = pathname.startsWith("/manage/my-events");
  const isDraftsActive = pathname.startsWith("/manage/drafts");
  const isBookingsActive = pathname.startsWith(`/user/${username}/bookings`);
  const isSpotlightActive = pathname.startsWith("/manage/spotlight");
  const { program } = useContentProgram();
  const showSpotlight =
    !team &&
    program.canPublish &&
    (program.spotlightPosting || program.storiesPosting);

  const isManageActive =
    isDashboardActive ||
    isFinancesActive ||
    isEventsActive ||
    isPlacesActive ||
    isMyEventsActive ||
    isDraftsActive ||
    isBookingsActive ||
    isSpotlightActive;

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
          {team ? (
            <span className="max-w-32 truncate text-xs text-muted-foreground">
              · {team.name ?? team.username}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        {acting.teams.length > 0 ? (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {tt("managingAs")}
            </DropdownMenuLabel>
            <DropdownMenuItem
              className={itemClass(!team)}
              onSelect={() => void switchTeam(null)}
            >
              {tt("yourAccount")}
            </DropdownMenuItem>
            {acting.teams.map((option) => (
              <DropdownMenuItem
                key={option.id}
                className={cn(
                  itemClass(team?.id === option.id),
                  "justify-between",
                )}
                onSelect={() => void switchTeam(option.id)}
              >
                <span className="truncate">
                  {option.name ?? option.username}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {tt("role", { role: option.role })}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}

        {showMoney && (
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

        {showMoney && <DropdownMenuSeparator />}

        {showOrganizer && (
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

        {showSpotlight && (
          <DropdownMenuItem asChild>
            <Link
              href="/manage/spotlight"
              onClick={onNavigate}
              className={itemClass(isSpotlightActive)}
            >
              <IoPlayCircleOutline className="text-lg" />
              {t("spotlightStories")}
            </Link>
          </DropdownMenuItem>
        )}

        {showPlaces && (
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

        {showDrafts ? (
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
        ) : null}

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
