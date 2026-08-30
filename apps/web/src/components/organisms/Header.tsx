"use client";

import ManageMenu from "@/components/molecules/ManageMenu";
import NotificationBell from "@/components/organisms/NotificationBell";
import { Button } from "@/components/ui/button";
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
import { useGetUserLocation } from "@/hooks/useUserLocation";
import { signOut } from "@/services/authService";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { generateSlug } from "@/utils/geerateSlug";
import { logger } from "@/utils/logger";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { HiOutlineLogin } from "react-icons/hi";
import { IoMenuOutline } from "react-icons/io5";
import { LiaTimesSolid } from "react-icons/lia";
import EventUploadButton from "../atoms/EventUploadButton";
import UserAvatar from "../atoms/UserAvatar";
import { cn } from "../lib/utils";
import SideBar from "./SideBar";

const defaultPublicId = "AnonymousProfile_rn6qez";

const defaulfVersion = "1743533914";

export default function Header() {
  const t = useTranslations("navigation");

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const pathname = usePathname();

  const location = useGetUserLocation();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const logoSrc =
    mounted && resolvedTheme === "dark"
      ? "/assets/images/abonten-logo-white.svg"
      : "/assets/images/abonten-logo-black.svg";

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

  const profile = {
    username: userDetails?.username ?? "",
    avatar_public_id: userDetails?.avatar_public_id ?? "",
    avatar_version: userDetails?.avatar_version ?? "",
  };

  const avatarUrl = profile.avatar_public_id
    ? buildCloudinaryUrl(profile.avatar_public_id, profile.avatar_version, {
        width: 60,
        height: 60,
      })
    : buildCloudinaryUrl(defaultPublicId, defaulfVersion, {
        width: 60,
        height: 60,
      });

  const isUserAccount = pathname === `/user/${profile.username}/posts`;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      logger.error("Error signing out:", error);
    }
  };

  const closeSidebar = () => setIsMenuOpen(false);

  return (
    <>
      <nav className="w-full flex justify-center fixed bg-sidebar z-20">
        <div className="flex justify-between py-5 w-[95%] border-b border-sidebar-border items-center">
          <div className="mx-auto lg:mx-0 flex items-center w-full">
            <div className="flex items-center gap-3">
              <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                    className="lg:hidden w-[30px] h-[30px] md:w-[40px] md:h-[40px] text-sidebar-foreground"
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
                  className="w-[80%] sm:max-w-none p-0 bg-sidebar text-sidebar-foreground border-sidebar-border"
                >
                  <SheetTitle className="sr-only">Navigation menu</SheetTitle>
                  <SideBar
                    onPostSuccess={closeSidebar}
                    onNavigate={closeSidebar}
                  />
                </SheetContent>
              </Sheet>

              {/* Desktop nav (below) hides the whole signed-in block under
              `lg`, and neither MobileNavBar nor SideBar surface
              notifications -- this is the only place mobile/tablet users
              can reach them, right next to the menu button. */}
              {!sessionLoading && userSession && (
                <div className="lg:hidden text-sidebar-foreground">
                  <NotificationBell align="left" />
                </div>
              )}
            </div>

            <Link
              href={`/explore/${generateSlug(location ?? "")}`}
              className="absolute right-4 transform lg:relative lg:translate-x-0 w-12 h-12 md:w-16 md:h-16"
            >
              <Image src={logoSrc} alt="Abonten Logo" fill priority />
            </Link>
          </div>

          {sessionLoading ? (
            <div className="hidden lg:flex items-center gap-7 min-w-fit">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-[60px] w-[60px] rounded-full" />
            </div>
          ) : userSession ? (
            <div className="hidden lg:flex items-center gap-7 min-w-fit text-sidebar-foreground">
              <ManageMenu
                username={profile.username}
                isOrganizer={isOrganizer}
                isPlaceOwner={isPlaceOwner}
                triggerClassName="hover:text-primary transition-colors"
              />

              <EventUploadButton />

              {/* Not gated on isOrganizer/isPlaceOwner like the links above --
              every signed-in user can have notifications, regardless of role. */}
              <NotificationBell />

              <button
                type="button"
                onClick={handleSignOut}
                className="flex gap-1 items-center hover:text-primary transition-colors"
              >
                <HiOutlineLogin className="text-3xl opacity-70" />
                {t("signOut")}
              </button>

              {profile.username && (
                <Link
                  href={`/user/${profile.username}/posts`}
                  className={cn(
                    "bg-transparent rounded-full font-bold border-border",
                    { hidden: isUserAccount },
                  )}
                >
                  <UserAvatar avatarUrl={avatarUrl} width={60} height={60} />
                </Link>
              )}
            </div>
          ) : (
            <div className="space-x-3 hidden lg:flex">
              <Link href="/auth/signin">
                <Button
                  variant="outline"
                  className="bg-transparent rounded-md font-bold"
                >
                  {t("signUp")}
                </Button>
              </Link>

              <Link href="/auth/signin">
                <Button
                  variant="outline"
                  className="bg-transparent rounded-md font-bold"
                >
                  {t("signIn")}
                </Button>
              </Link>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
