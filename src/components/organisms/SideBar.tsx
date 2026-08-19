"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser, useIsOrganizer } from "@/hooks/useCurrentUser";
import { useImageSelection } from "@/hooks/useImageSelection";
import { useGetUserLocation } from "@/hooks/useUserLocation";
import { signOut } from "@/services/authService";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GiPartyFlags } from "react-icons/gi";
import { GoHome } from "react-icons/go";
import { HiOutlineLogin } from "react-icons/hi";
import { IoCreateOutline } from "react-icons/io5";
import {
  MdOutlineAccountBalanceWallet,
  MdOutlineDrafts,
  MdOutlineManageHistory,
  MdOutlineSpaceDashboard,
} from "react-icons/md";
import { cn } from "../lib/utils";
import EventUploadModal from "./EventUploadModal";
import MobileFooter from "./MobileFooter";

type menuClickedProp = {
  menuClicked: boolean;
  onCloseAnimationEnd?: () => void;
  onPostSuccess?: () => void;
  onNavigate?: () => void;
};

export default function SideBar({
  menuClicked,
  onCloseAnimationEnd,
  onPostSuccess,
  onNavigate,
}: menuClickedProp) {
  const t = useTranslations("navigation");

  const [showPostModal, setShowPostModal] = useState(false);

  const location = useGetUserLocation();

  const router = useRouter();

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const { imagePreview, selectedFile, fileInputRef, handleFileChange } =
    useImageSelection({
      invalidFileMessage: "Please select an image file for your event flyer.",
      onInvalidFile: (message) => alert(message),
      onSelect: () => setShowPostModal(true),
    });

  const closePopup = (state: boolean) => {
    setShowPostModal(state);
  };

  // Shared with Header/MobileNavBar/etc. — one cached fetch instead of
  // each component independently calling supabase.auth.getUser().
  const { data: user, isLoading: userLoading } = useCurrentUser();

  // Gates the Organizer Dashboard link specifically — My Events/Manage
  // Attendance below keep their existing "any signed-in user" visibility.
  const isOrganizer = useIsOrganizer();

  return (
    <>
      {showPostModal && imagePreview && selectedFile && (
        <EventUploadModal
          handleClosePopup={closePopup}
          imgUrl={imagePreview}
          selectedFile={selectedFile}
          onUploadSuccess={onPostSuccess}
        />
      )}

      <div className="bg-overlay/50 w-full flex lg:hidden fixed z-20 left-0 top-[71px] h-[100%]">
        <div
          className={cn(
            "bg-sidebar text-sidebar-foreground w-[80%]",
            menuClicked ? "animate-slideIn" : "animate-slideOut",
          )}
          onAnimationEnd={() => {
            if (!menuClicked) onCloseAnimationEnd?.();
          }}
        >
          {userLoading ? (
            <div className="pl-[5%] md:pl-[10%] mt-5 flex flex-col gap-5">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i.toLocaleString()} className="h-5 w-28" />
              ))}
            </div>
          ) : user ? (
            <div className="pl-[5%] md:pl-[10%] mt-5 flex flex-col gap-5">
              <Link
                href={`/events/location/${location}`}
                onClick={onNavigate}
                className="flex gap-1 items-center hover:text-primary transition-colors"
              >
                <GoHome className="text-xl" />
                {t("home")}
              </Link>

              <button
                type="button"
                className="flex gap-1 items-center hover:text-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <IoCreateOutline className="text-xl" />
                {t("post")}
              </button>

              {isOrganizer && (
                <Link
                  href="/manage/dashboard"
                  onClick={onNavigate}
                  className="flex gap-1 items-center hover:text-primary transition-colors"
                >
                  <MdOutlineSpaceDashboard className="text-xl" />
                  {t("dashboard")}
                </Link>
              )}

              {isOrganizer && (
                <Link
                  href="/finances"
                  onClick={onNavigate}
                  className="flex gap-1 items-center hover:text-primary transition-colors"
                >
                  <MdOutlineAccountBalanceWallet className="text-xl" />
                  {t("finances")}
                </Link>
              )}

              <Link
                href="/manage/attendance/event-list"
                onClick={onNavigate}
                className="flex gap-1 items-center hover:text-primary transition-colors"
              >
                <MdOutlineManageHistory className="text-xl" />
                {t("manageAttendance")}
              </Link>

              <Link
                href="/manage/my-events"
                onClick={onNavigate}
                className="flex gap-1 items-center hover:text-primary transition-colors"
              >
                <GiPartyFlags className="text-xl" />
                {t("myEvents")}
              </Link>

              <Link
                href="/manage/drafts"
                onClick={onNavigate}
                className="flex gap-1 items-center hover:text-primary transition-colors"
              >
                <MdOutlineDrafts className="text-xl" />
                {t("drafts")}
              </Link>

              <input
                type="file"
                accept="image/*"
                hidden
                ref={fileInputRef}
                onChange={handleFileChange}
              />

              <button
                type="button"
                onClick={handleSignOut}
                className="flex gap-1 items-center hover:text-primary transition-colors"
              >
                <HiOutlineLogin className="text-2xl opacity-70" />
                {t("signOut")}
              </button>
            </div>
          ) : (
            <div className="pl-[5%] md:pl-[10%] mt-5 flex flex-col items-start gap-2 font-bold">
              <Link href="/auth/signin" onClick={onNavigate}>
                {t("signIn")}
              </Link>

              <Link href="/auth/signin" onClick={onNavigate}>
                {t("signUp")}
              </Link>
            </div>
          )}

          <MobileFooter />
        </div>
      </div>
    </>
  );
}
