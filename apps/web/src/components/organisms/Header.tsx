"use client";

import AccountMenu from "@/components/molecules/AccountMenu";
import DesktopPrimaryNav from "@/components/molecules/DesktopPrimaryNav";
import HeaderSearchLink from "@/components/molecules/HeaderSearchLink";
import ManageMenu from "@/components/molecules/ManageMenu";
import NotificationBell from "@/components/organisms/NotificationBell";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCurrentUserDetails,
  useIsOrganizer,
  useIsPlaceOwner,
} from "@/hooks/useCurrentUser";
import { useExploreHref } from "@/hooks/useExploreHref";
import { MessagesNavLink } from "@/messaging/components/MessagesNavLink";
import { signOut } from "@/services/authService";
import { buildAvatarUrl } from "@abonten/core/cloudinaryUrl";
import { logger } from "@abonten/core/logger";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { IoMenuOutline } from "react-icons/io5";
import { LiaTimesSolid } from "react-icons/lia";
import EventUploadButton from "../atoms/EventUploadButton";
import SideBar from "./SideBar";

export default function Header() {
  const t = useTranslations("navigation");

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const exploreHref = useExploreHref();

  // Shared with SideBar/MobileNavBar/etc. — one cached fetch instead of
  // each component independently calling supabase.auth.getUser().
  const {
    user: userSession,
    userLoading: sessionLoading,
    data: userDetails,
  } = useCurrentUserDetails();

  // Gates the Organizer Dashboard link specifically — My Events below keeps
  // its existing "any signed-in user" visibility.
  const isOrganizer = useIsOrganizer();
  // Gates the Places link (Places feature Milestone 6) — only shown to
  // users who actually own at least one place.
  const isPlaceOwner = useIsPlaceOwner();

  const username = userDetails?.username ?? "";
  const avatarUrl = buildAvatarUrl(
    userDetails?.avatar_public_id,
    userDetails?.avatar_version,
    { width: 40, height: 40 },
  );

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      logger.error("Error signing out:", error);
    }
  };

  const closeSidebar = () => setIsMenuOpen(false);

  return (
    <header className="w-full flex justify-center fixed bg-sidebar/95 backdrop-blur supports-[backdrop-filter]:bg-sidebar/85 z-20">
      <div className="flex items-center justify-between gap-4 lg:gap-6 py-5 w-[95%] border-b border-sidebar-border">
        {/* Left: menu (narrow screens), brand, and on wide screens the
            public destinations. */}
        <div className="flex min-w-0 items-center gap-3 lg:gap-6">
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label={isMenuOpen ? t("closeMenu") : t("openMenu")}
                className="lg:hidden -ml-1 flex h-10 w-10 items-center justify-center rounded-full text-sidebar-foreground transition-colors hover:bg-accent"
              >
                {isMenuOpen ? (
                  <LiaTimesSolid className="text-2xl" />
                ) : (
                  <IoMenuOutline className="text-2xl" />
                )}
              </button>
            </SheetTrigger>

            <SheetContent
              side="left"
              className="w-[80%] sm:max-w-sm p-0 bg-sidebar text-sidebar-foreground border-sidebar-border"
            >
              <SheetTitle className="sr-only">{t("navigationMenu")}</SheetTitle>
              <SideBar onPostSuccess={closeSidebar} onNavigate={closeSidebar} />
            </SheetContent>
          </Sheet>

          <Link
            href={exploreHref}
            aria-label={t("abontenHome")}
            className="flex shrink-0 items-center"
          >
            {/* The mark alone on narrow screens (the Small weight is drawn
                for 25-63 px); the ABƆNTEN logotype where there is room.
                Both colourways are in the HTML and CSS picks one, so the
                logo never flashes the wrong colour while the theme loads. */}
            <Image
              src="/assets/images/brand/abonten-mark-small-light.svg"
              alt="Abonten"
              width={40}
              height={40}
              priority
              className="h-10 w-10 lg:hidden dark:hidden"
            />
            <Image
              src="/assets/images/brand/abonten-mark-small-night.svg"
              alt="Abonten"
              width={40}
              height={40}
              priority
              className="hidden h-10 w-10 dark:block lg:dark:hidden"
            />
            <Image
              src="/assets/images/brand/abonten-logotype-light.svg"
              alt="Abonten"
              width={160}
              height={30}
              priority
              className="hidden h-[30px] w-auto lg:block dark:lg:hidden"
            />
            <Image
              src="/assets/images/brand/abonten-logotype-night.svg"
              alt="Abonten"
              width={160}
              height={30}
              priority
              className="hidden h-[30px] w-auto dark:lg:block"
            />
          </Link>

          <div className="hidden lg:block">
            <DesktopPrimaryNav exploreHref={exploreHref} />
          </div>
        </div>

        <div className="hidden lg:flex flex-1 justify-end xl:justify-center">
          <HeaderSearchLink />
        </div>

        {/* Right: what the visitor can do. */}
        {sessionLoading ? (
          <div className="flex items-center gap-4">
            <Skeleton className="hidden lg:block h-6 w-20" />
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="hidden lg:block h-10 w-10 rounded-full" />
          </div>
        ) : userSession ? (
          <div className="flex items-center gap-4 lg:gap-6 text-sidebar-foreground">
            <div className="hidden lg:flex items-center gap-6">
              <ManageMenu
                username={username}
                isOrganizer={isOrganizer}
                isPlaceOwner={isPlaceOwner}
                triggerClassName="hover:text-primary transition-colors"
              />

              <EventUploadButton />
            </div>

            {/* Not gated on isOrganizer/isPlaceOwner like the Manage menu --
                every signed-in user can have messages/notifications. On
                narrow screens this is the only way to reach notifications. */}
            <MessagesNavLink />

            <NotificationBell />

            <div className="hidden lg:block">
              <AccountMenu
                avatarUrl={avatarUrl}
                username={username}
                fullName={userDetails?.full_name ?? null}
                onSignOut={handleSignOut}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/auth/signin"
              className="hidden sm:inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-sidebar-foreground transition-colors hover:bg-accent"
            >
              {t("signIn")}
            </Link>

            <Link
              href="/auth/signin"
              className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("signUp")}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
