"use client";

import UserAvatar from "@/components/atoms/UserAvatar";
import ManageMenu from "@/components/molecules/ManageMenu";
import { Skeleton } from "@/components/ui/skeleton";
import FieldOpsNavLink from "@/fieldOps/atoms/FieldOpsNavLink";
import {
  useCurrentUserDetails,
  useIsOrganizer,
  useIsPlaceOwner,
} from "@/hooks/useCurrentUser";
import { useImageSelection } from "@/hooks/useImageSelection";
import { useToast } from "@/hooks/useToast";
import CreateMenu from "@/places/molecules/CreateMenu";
import PlaceUploadModal from "@/places/organisms/PlaceUploadModal";
import RewardsNavLink from "@/rewards/atoms/RewardsNavLink";
import { signOut } from "@/services/authService";
import SpotlightNavLink from "@/spotlight/atoms/SpotlightNavLink";
import WeeklyNavLink from "@/weekly/atoms/WeeklyNavLink";
import { buildAvatarUrl } from "@abonten/core/cloudinaryUrl";
import { logger } from "@abonten/core/logger";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@abonten/core/uploadLimits";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HiOutlineLogin } from "react-icons/hi";
import { IoSettingsOutline } from "react-icons/io5";
import EventUploadModal from "./EventUploadModal";
import MobileFooter from "./MobileFooter";

type SideBarProps = {
  onPostSuccess?: () => void;
  onNavigate?: () => void;
};

// One row style for every entry, so links, menus and buttons line up and
// each is a comfortable touch target.
const ROW =
  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-accent hover:text-sidebar-foreground";

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
      onNavigate?.();
      router.push("/");
    } catch (error) {
      logger.error("Error signing out:", error);
    }
  };

  // Same size limit as the wide-screen Create button (EventUploadButton), so
  // an oversized flyer is refused here too, before the upload form opens.
  const { imagePreview, selectedFile, fileInputRef, handleFileChange } =
    useImageSelection({
      invalidFileMessage: t("pleaseSelectAnImageFileFor"),
      maxSizeBytes: MAX_EVENT_FLYER_SIZE_BYTES,
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
  const username = userDetails?.username ?? "";

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

      {/* Full-height flex column: the nav block sizes to its content and the
          footer is pushed to the bottom (mt-auto) instead of being
          absolutely positioned, so there's no dead space beneath it. pt-14
          clears the Sheet's close button before the first action. */}
      <div className="flex h-full flex-col overflow-y-auto px-3 pt-14 pb-6">
        {userLoading ? (
          <div className="flex flex-col gap-5 px-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i.toLocaleString()} className="h-5 w-28" />
            ))}
          </div>
        ) : user ? (
          <div className="flex flex-col gap-1">
            {username && (
              <Link
                href={`/user/${username}/posts`}
                onClick={onNavigate}
                className="mb-3 flex items-center gap-3 rounded-xl border border-sidebar-border p-3 transition-colors hover:bg-accent"
              >
                <UserAvatar
                  avatarUrl={buildAvatarUrl(
                    userDetails?.avatar_public_id,
                    userDetails?.avatar_version,
                    { width: 44, height: 44 },
                  )}
                  width={44}
                  height={44}
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {userDetails?.full_name || `@${username}`}
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {t("viewProfile")}
                  </span>
                </span>
              </Link>
            )}

            <CreateMenu
              label={t("create")}
              onSelectEvent={() => fileInputRef.current?.click()}
              onSelectPlace={() => setShowPlaceModal(true)}
              triggerClassName={ROW}
              iconClassName="text-2xl opacity-70"
            />

            <ManageMenu
              username={username}
              isOrganizer={isOrganizer}
              isPlaceOwner={isPlaceOwner}
              onNavigate={onNavigate}
              triggerClassName={ROW}
            />

            <WeeklyNavLink onNavigate={onNavigate} className={ROW} />

            <SpotlightNavLink onNavigate={onNavigate} className={ROW} />

            <RewardsNavLink onNavigate={onNavigate} className={ROW} />

            <FieldOpsNavLink onNavigate={onNavigate} className={ROW} />

            <Link href="/settings" onClick={onNavigate} className={ROW}>
              <IoSettingsOutline aria-hidden className="text-2xl opacity-70" />
              {t("settings")}
            </Link>

            <input
              type="file"
              accept="image/*"
              hidden
              ref={fileInputRef}
              onChange={handleFileChange}
            />

            <button type="button" onClick={handleSignOut} className={ROW}>
              <HiOutlineLogin aria-hidden className="text-2xl opacity-70" />
              {t("signOut")}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="mb-4 flex flex-col gap-2 px-1">
              <Link
                href="/auth/signin"
                onClick={onNavigate}
                className="flex h-11 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {t("signUp")}
              </Link>

              <Link
                href="/auth/signin"
                onClick={onNavigate}
                className="flex h-11 items-center justify-center rounded-full border border-sidebar-border font-semibold transition-colors hover:bg-accent"
              >
                {t("signIn")}
              </Link>
            </div>

            <WeeklyNavLink onNavigate={onNavigate} className={ROW} />

            <SpotlightNavLink onNavigate={onNavigate} className={ROW} />
          </div>
        )}

        <MobileFooter onNavigate={onNavigate} />
      </div>
    </>
  );
}
