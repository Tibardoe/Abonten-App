"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUserDetails, useIsOrganizer } from "@/hooks/useCurrentUser";
import { useGetUserLocation } from "@/hooks/useUserLocation";
import { signOut } from "@/services/authService";
import { buildCloudinaryUrl } from "@/utils/cloudinaryUrl";
import { generateSlug } from "@/utils/geerateSlug";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GiPartyFlags } from "react-icons/gi";
import { HiOutlineLogin } from "react-icons/hi";
import { IoMenuOutline } from "react-icons/io5";
import { LiaTimesSolid } from "react-icons/lia";
import {
  MdOutlineDrafts,
  MdOutlineManageHistory,
  MdOutlineSpaceDashboard,
} from "react-icons/md";
import EventUploadButton from "../atoms/EventUploadButton";
import UserAvatar from "../atoms/UserAvatar";
import { cn } from "../lib/utils";
import SideBar from "./SideBar";

const defaultPublicId = "AnonymousProfile_rn6qez";

const defaulfVersion = "1743533914";

export default function Header() {
  const t = useTranslations("navigation");

  const [isMenuClicked, setIsMenuClicked] = useState(false);
  // Kept mounted through the close animation so `animate-slideOut` gets a
  // chance to play; unmounted only once `onAnimationEnd` confirms it finished.
  const [isSidebarMounted, setIsSidebarMounted] = useState(false);

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

  // Gates the Organizer Dashboard link specifically — My Events/Manage
  // Attendance below keep their existing "any signed-in user" visibility.
  const isOrganizer = useIsOrganizer();

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
      console.error("Error signing out:", error);
    }
  };

  const toggleMenu = () => {
    if (isMenuClicked) {
      setIsMenuClicked(false);
    } else {
      setIsSidebarMounted(true);
      setIsMenuClicked(true);
    }
  };

  const closeSidebar = () => {
    setIsMenuClicked(false);
  };

  return (
    <>
      {isSidebarMounted && (
        <SideBar
          menuClicked={isMenuClicked}
          onCloseAnimationEnd={() => setIsSidebarMounted(false)}
          onPostSuccess={closeSidebar}
          onNavigate={closeSidebar}
        />
      )}

      <nav className="w-full flex justify-center fixed bg-sidebar z-20">
        <div className="flex justify-between py-5 w-[95%] border-b border-sidebar-border items-center">
          <div className="mx-auto lg:mx-0 flex items-center w-full">
            {/* Menu toggle button */}
            <button
              type="button"
              onClick={toggleMenu}
              className="lg:hidden w-[30px] h-[30px] md:w-[40px] md:h-[40px] text-sidebar-foreground"
            >
              {isMenuClicked ? (
                <LiaTimesSolid className="text-2xl" />
              ) : (
                <IoMenuOutline className="text-2xl" />
              )}
            </button>

            <Link
              href={`/events/location/${generateSlug(location ?? "")}`}
              className="absolute right-4 transform lg:static lg:translate-x-0 w-12 h-12 md:w-16 md:h-16"
            >
              <Image src={logoSrc} alt="Abonten Logo" fill />
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
              {isOrganizer && (
                <Link
                  href="/manage/dashboard"
                  className="flex gap-1 items-center hover:text-primary transition-colors"
                >
                  <MdOutlineSpaceDashboard className="text-2xl" />
                  {t("dashboard")}
                </Link>
              )}

              <Link
                href="/manage/attendance/event-list"
                className="flex gap-1 items-center hover:text-primary transition-colors"
              >
                <MdOutlineManageHistory className="text-2xl" />
                {t("manageAttendance")}
              </Link>

              <Link
                href="/manage/my-events"
                className="flex gap-1 items-center hover:text-primary transition-colors"
              >
                <GiPartyFlags className="text-2xl" />
                {t("myEvents")}
              </Link>

              <Link
                href="/manage/drafts"
                className="flex gap-1 items-center hover:text-primary transition-colors"
              >
                <MdOutlineDrafts className="text-2xl" />
                {t("drafts")}
              </Link>

              <EventUploadButton />

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
