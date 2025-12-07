"use client";

import { getUserDetails } from "@/actions/getUserDetails";
import { getUserEventRole } from "@/actions/getUserEventRole";
import { Button } from "@/components/ui/button";
import { supabase } from "@/config/supabase/client";
import { useGetUserLocation } from "@/hooks/useUserLocation";
import { signOut } from "@/services/authService";
import { generateSlug } from "@/utils/geerateSlug";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GiPartyFlags } from "react-icons/gi";
import { HiOutlineLogin } from "react-icons/hi";
import { IoMenuOutline } from "react-icons/io5";
import { LiaTimesSolid } from "react-icons/lia";
import { MdOutlineManageHistory } from "react-icons/md";
import EventUploadButton from "../atoms/EventUploadButton";
import UserAvatar from "../atoms/UserAvatar";
import { cn } from "../lib/utils";
import AuthPopup from "./AuthPopup";
import MobileAuthPopup from "./MobileAuthPopup";
import SideBar from "./SideBar";

const CLOUDINARY_BASE_URL = "https://res.cloudinary.com/abonten/image/upload/";

const defaultPublicId = "AnonymousProfile_rn6qez";

const defaulfVersion = "1743533914";

export default function Header() {
  const [authType, setAuthType] = useState<"Sign Up" | "Sign In" | "">("");
  const [showAuthPopup, setShowAuthPopup] = useState(false);
  const [isMenuClicked, setIsMenuClicked] = useState(false);

  const pathname = usePathname();

  const location = useGetUserLocation();

  // Query for user session
  const {
    data: userSession,
    // isLoading: sessionLoading,
    // error: sessionError,
  } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error(error?.message || "No user");
      return data.user;
    },
  });

  // Query for user details
  const {
    data: userDetails,
    // isLoading: detailsLoading
  } = useQuery({
    queryKey: ["user-details", userSession?.id],
    enabled: !!userSession?.id,
    queryFn: async () => {
      const details = await getUserDetails();
      return details?.status === 200 ? details.userDetails : null;
    },
  });

  // Query for user role
  const { data: userRole } = useQuery({
    queryKey: ["user-role", userSession?.id],
    enabled: !!userSession?.id,
    queryFn: () => getUserEventRole(userSession?.id ?? ""),
  });

  const profile = {
    username: userDetails?.username ?? "",
    avatar_public_id: userDetails?.avatar_public_id ?? "",
    avatar_version: userDetails?.avatar_version ?? "",
  };

  const avatarUrl = profile.avatar_public_id
    ? `${CLOUDINARY_BASE_URL}v${profile.avatar_version}/${profile.avatar_public_id}.jpg`
    : `${CLOUDINARY_BASE_URL}v${defaulfVersion}/${defaultPublicId}.jpg`;

  const isUserAccount = pathname === `/user/${profile.username}/posts`;
  const isOrganizer = userRole?.role?.includes("organizer");
  const isAttendee = userRole?.role?.includes("attendee");

  const handleClick = (type: "Sign Up" | "Sign In") => {
    setAuthType(type);
    setShowAuthPopup(true);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const toggleMenu = () => {
    setIsMenuClicked((prev) => !prev);
  };

  return (
    <>
      {showAuthPopup && (
        <>
          <AuthPopup
            buttonText={authType}
            onClose={() => setShowAuthPopup(false)}
          />
          <MobileAuthPopup
            buttonText={authType}
            onClose={() => setShowAuthPopup(false)}
          />
        </>
      )}

      {isMenuClicked && <SideBar menuClicked={isMenuClicked} />}

      <nav className="w-full flex justify-center fixed bg-white z-20">
        <div className="flex justify-between py-5 w-[95%] border-b border-black-500 items-center">
          <div className="mx-auto lg:mx-0 flex items-center w-full">
            {/* Menu toggle button */}
            <button
              type="button"
              onClick={toggleMenu}
              className="lg:hidden w-[30px] h-[30px] md:w-[40px] md:h-[40px]"
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
              <Image
                src="/assets/images/abonten-logo-black.svg"
                alt="Abonten Logo Black"
                fill
              />
            </Link>
          </div>

          {userSession ? (
            <div className="hidden lg:flex items-center gap-7 min-w-fit">
              {isOrganizer && (
                <Link
                  href="/manage/attendance/event-list"
                  className="flex gap-1 items-center"
                >
                  <MdOutlineManageHistory className="text-2xl" />
                  Manage Attendance
                </Link>
              )}
              {isAttendee && (
                <Link
                  href="/manage/my-events"
                  className="flex gap-1 items-center"
                >
                  <GiPartyFlags className="text-2xl" />
                  My Events
                </Link>
              )}

              <EventUploadButton />

              <button
                type="button"
                onClick={handleSignOut}
                className="flex gap-1 items-center"
              >
                <HiOutlineLogin className="text-3xl opacity-70" />
                SignOut
              </button>

              {profile.username && (
                <Link
                  href={`/user/${profile.username}/posts`}
                  className={cn(
                    "bg-transparent rounded-full font-bold border-black",
                    { hidden: isUserAccount },
                  )}
                >
                  <UserAvatar avatarUrl={avatarUrl} width={60} height={60} />
                </Link>
              )}
            </div>
          ) : (
            <div className="space-x-3 hidden lg:flex">
              <Button
                variant="outline"
                className="bg-transparent rounded-md font-bold border-black"
                onClick={() => handleClick("Sign Up")}
              >
                Sign Up
              </Button>
              <Button
                variant="outline"
                className="bg-transparent rounded-md font-bold border-black"
                onClick={() => handleClick("Sign In")}
              >
                Sign In
              </Button>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}
