"use client";

import UserAvatar from "@/components/atoms/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFieldOpsMe } from "@/hooks/useFieldOpsMe";
import { useRewardsProgram } from "@/hooks/useRewardsProgram";
import { HELP_PATH } from "@abonten/core/brand/socialLinks";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { HiOutlineLogin } from "react-icons/hi";
import {
  IoGiftOutline,
  IoHelpCircleOutline,
  IoMapOutline,
  IoPersonOutline,
  IoSettingsOutline,
  IoTicketOutline,
} from "react-icons/io5";
import { MdOutlineReceipt } from "react-icons/md";

type AccountMenuProps = {
  avatarUrl: string;
  username: string;
  fullName: string | null;
  onSignOut: () => void;
};

// The avatar at the right of the wide-screen header opens everything that is
// about the signed-in person rather than about what they manage (that stays
// in the Manage menu): their profile, tickets, money, settings, and signing
// out — which used to sit in the header bar itself, one misclick away.
export default function AccountMenu({
  avatarUrl,
  username,
  fullName,
  onSignOut,
}: AccountMenuProps) {
  const t = useTranslations("navigation");
  const { data: rewards } = useRewardsProgram();
  const { data: fieldOps } = useFieldOpsMe();
  const showFieldWork = !!fieldOps?.programEnabled && !!fieldOps.current;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("accountMenu")}
          className="rounded-full ring-offset-background transition-shadow hover:ring-2 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <UserAvatar avatarUrl={avatarUrl} width={40} height={40} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-3 py-2 font-normal">
          <UserAvatar avatarUrl={avatarUrl} width={36} height={36} />
          <span className="min-w-0">
            {fullName && (
              <span className="block truncate text-sm font-semibold">
                {fullName}
              </span>
            )}
            {username && (
              <span className="block truncate text-xs text-muted-foreground">
                @{username}
              </span>
            )}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {username && (
          <DropdownMenuItem asChild className="gap-2">
            <Link href={`/user/${username}/posts`}>
              <IoPersonOutline className="text-lg" />
              {t("profile")}
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuItem asChild className="gap-2">
          <Link href="/manage/my-events">
            <IoTicketOutline className="text-lg" />
            {t("myEvents")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="gap-2">
          <Link href="/transactions">
            <MdOutlineReceipt className="text-lg" />
            {t("transactions")}
          </Link>
        </DropdownMenuItem>

        {rewards?.enabled && (
          <DropdownMenuItem asChild className="gap-2">
            <Link href="/rewards">
              <IoGiftOutline className="text-lg" />
              {t("rewards")}
            </Link>
          </DropdownMenuItem>
        )}

        {showFieldWork && (
          <DropdownMenuItem asChild className="gap-2">
            <Link href="/field">
              <IoMapOutline className="text-lg" />
              {t("fieldWork")}
            </Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild className="gap-2">
          <Link href="/settings">
            <IoSettingsOutline className="text-lg" />
            {t("settings")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="gap-2">
          <Link href={HELP_PATH}>
            <IoHelpCircleOutline className="text-lg" />
            {t("help")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem className="gap-2" onSelect={onSignOut}>
          <HiOutlineLogin className="text-lg" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
