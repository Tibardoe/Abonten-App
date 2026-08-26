"use client";

import ManageMenu from "@/components/molecules/ManageMenu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCurrentUserDetails,
  useIsOrganizer,
  useIsPlaceOwner,
} from "@/hooks/useCurrentUser";
import { useImageSelection } from "@/hooks/useImageSelection";
import { useToast } from "@/hooks/useToast";
import CreateMenu from "@/places/molecules/CreateMenu";
import PlaceUploadModal from "@/places/organisms/PlaceUploadModal";
import { signOut } from "@/services/authService";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HiOutlineLogin } from "react-icons/hi";
import EventUploadModal from "./EventUploadModal";
import MobileFooter from "./MobileFooter";

type SideBarProps = {
  onPostSuccess?: () => void;
  onNavigate?: () => void;
};

// Rendered as the content of the mobile navigation Sheet (see Header.tsx) --
// positioning, the overlay, slide animation, focus trap, and Escape/outside-
// click-to-close all come from Sheet/Radix Dialog now, so this component
// only owns the nav content itself.
export default function SideBar({ onPostSuccess, onNavigate }: SideBarProps) {
  const t = useTranslations("navigation");
  const toast = useToast();

  const [showPostModal, setShowPostModal] = useState(false);
  const [showPlaceModal, setShowPlaceModal] = useState(false);

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
      onInvalidFile: (message) => toast.error(message),
      onSelect: () => setShowPostModal(true),
    });

  const closePopup = (state: boolean) => {
    setShowPostModal(state);
  };

  const closePlaceModal = (state: boolean) => {
    setShowPlaceModal(state);
  };

  // Shared with Header/MobileNavBar/etc. — one cached fetch instead of
  // each component independently calling supabase.auth.getUser(). Needs the
  // profile details (not just useCurrentUser()) so the Manage menu below has
  // a username for its Bookings link.
  const { user, userLoading, data: userDetails } = useCurrentUserDetails();

  // Gates the Organizer Dashboard link specifically — My Events below keeps
  // its existing "any signed-in user" visibility.
  const isOrganizer = useIsOrganizer();
  // Gates the Places link (Places feature Milestone 6) — only shown to
  // users who actually own at least one place.
  const isPlaceOwner = useIsPlaceOwner();

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

      {showPlaceModal && (
        <PlaceUploadModal
          handleClosePopup={closePlaceModal}
          onUploadSuccess={onPostSuccess}
        />
      )}

      <div className="h-full overflow-y-auto">
        {userLoading ? (
          <div className="pl-[5%] md:pl-[10%] mt-5 flex flex-col gap-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i.toLocaleString()} className="h-5 w-28" />
            ))}
          </div>
        ) : user ? (
          <div className="pl-[5%] md:pl-[10%] mt-5 flex flex-col gap-5">
            <CreateMenu
              label={t("create")}
              onSelectEvent={() => fileInputRef.current?.click()}
              onSelectPlace={() => setShowPlaceModal(true)}
              triggerClassName="hover:text-primary transition-colors"
              iconClassName="text-xl"
            />

            <ManageMenu
              username={userDetails?.username ?? ""}
              isOrganizer={isOrganizer}
              isPlaceOwner={isPlaceOwner}
              onNavigate={onNavigate}
              triggerClassName="hover:text-primary transition-colors"
            />

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
    </>
  );
}
