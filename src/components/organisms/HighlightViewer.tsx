"use client";

import { deleteHighlightSlide } from "@/actions/deleteHighlightSlide";
import HighlightMenuButton from "@/components/atoms/HighlightMenuButton";
import UserAvatar from "@/components/atoms/UserAvatar";
import type { HighlightMenuAction } from "@/components/molecules/HighlightMenu";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useHighlightViewer } from "@/hooks/useHighlightViewer";
import type { HighlightGroup } from "@/types/highlightType";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { IoMdArrowBack } from "react-icons/io";
import { IoChevronBack, IoChevronForward, IoPlay } from "react-icons/io5";
import { SlControlPause } from "react-icons/sl";

type HighlightViewerProps = {
  groups: HighlightGroup[];
  initialGroupIndex: number;
  avatarUrl: string;
  username: string;
  isOwner: boolean;
  onClose: () => void;
};

export default function HighlightViewer({
  groups,
  initialGroupIndex,
  avatarUrl,
  username,
  isOwner,
  onClose,
}: HighlightViewerProps) {
  const queryClient = useQueryClient();

  const [showMenu, setShowMenu] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // The mobile and desktop header rows below each render their own
  // HighlightMenuButton (same `showMenu` state, different DOM position, per
  // this file's responsive-duplication pattern) — CSS only hides the
  // inactive one, it stays mounted. Without these, the hidden instance's own
  // click-outside check sees clicks inside the *visible* instance's dropdown
  // as "outside" (different DOM subtree) and closes the shared state before
  // the click can reach an action button. Passing each instance's root as
  // the other's excludeRefs makes both treat "inside either" as inside.
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const desktopMenuRef = useRef<HTMLDivElement | null>(null);

  const {
    currentGroup,
    currentIndex,
    currentSlide,
    progressBars,
    isPaused,
    isLoading,
    setIsLoading,
    isLongPressHolding,
    currentAnimationDuration,
    videoRef,
    handleNextSlide,
    handlePreviousSlide,
    handleMediaClick,
    handleMediaKeyDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleVideoLoadedMetadata,
    handleVideoCanPlay,
    removeSlide,
    pause,
    resume,
  } = useHighlightViewer({ groups, initialGroupIndex, onClose });

  // Holds playback paused for as long as the 3-dot menu or its confirmation
  // dialog is open, and restores the exact prior state (playing or already
  // paused) once both are closed — reuses the hook's own pause/resume
  // bookkeeping rather than a separate timer system.
  const isHeldRef = useRef(false);
  const wasPausedBeforeHoldRef = useRef(false);

  // useClickOutside (behind the 3-dot menu) closes on mousedown/touchstart —
  // before the SAME physical tap's concluding click/touchend fires. That
  // means the media's click/touch handlers are already un-gated (and
  // playback already resumed, below) by the time that concluding event
  // arrives, so it lands on the now-active media handler and immediately
  // re-toggles pause (or navigates) within the very gesture that was only
  // meant to dismiss the menu. This flag lets the next media interaction
  // recognize "I'm the tail end of the gesture that just closed the
  // menu/dialog" and consume itself once instead of acting. The fallback
  // timeout covers closes that never reach the media at all (e.g. the
  // confirm dialog's own Yes/Cancel buttons), so a later, genuinely new tap
  // is never left incorrectly suppressed.
  const suppressNextMediaInteractionRef = useRef(false);
  const suppressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Only reacts to the menu/confirm-dialog visibility changing — not to
  // `isPaused` itself, which this effect also sets, or to `pause`/`resume`
  // identity (already stable) — including them would re-run this on every
  // pause toggle and fight with independent pause actions (e.g. tapping
  // the media directly) while the menu/dialog are closed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    const shouldHold = showMenu || showConfirmDelete;

    if (shouldHold && !isHeldRef.current) {
      wasPausedBeforeHoldRef.current = isPaused;
      isHeldRef.current = true;
      if (!isPaused) {
        pause();
      }
    } else if (!shouldHold && isHeldRef.current) {
      isHeldRef.current = false;
      suppressNextMediaInteractionRef.current = true;
      if (suppressTimeoutRef.current) {
        clearTimeout(suppressTimeoutRef.current);
      }
      suppressTimeoutRef.current = setTimeout(() => {
        suppressNextMediaInteractionRef.current = false;
        suppressTimeoutRef.current = null;
      }, 300);
      if (!wasPausedBeforeHoldRef.current) {
        resume();
      }
    }
  }, [showMenu, showConfirmDelete]);

  const consumeMediaSuppression = () => {
    if (!suppressNextMediaInteractionRef.current) return false;
    suppressNextMediaInteractionRef.current = false;
    if (suppressTimeoutRef.current) {
      clearTimeout(suppressTimeoutRef.current);
      suppressTimeoutRef.current = null;
    }
    return true;
  };

  const guardedMediaClick = () => {
    if (consumeMediaSuppression()) return;
    handleMediaClick();
  };

  const guardedTouchEnd = (
    e: React.TouchEvent<HTMLDivElement>,
    zone: "prev" | "next",
  ) => {
    if (consumeMediaSuppression()) return;
    handleTouchEnd(e, zone);
  };

  if (!currentGroup || !currentSlide) {
    return null;
  }

  const handleDeleteSlide = async () => {
    setIsDeleting(true);
    const response = await deleteHighlightSlide(currentSlide.id);
    setIsDeleting(false);

    if (response.status !== 200) {
      setDeleteError(response.message ?? "Failed to delete slide.");
      setTimeout(() => setDeleteError(null), 3000);
      return;
    }

    setShowConfirmDelete(false);
    removeSlide(currentSlide.id);
    queryClient.invalidateQueries({ queryKey: ["highlights", username] });
  };

  const backgroundSrc =
    currentSlide.media_type === "video"
      ? currentSlide.thumbnail_url
      : currentSlide.media_url;

  // Defined once and reused by both the mobile and desktop header rows below
  // (two separate elements, per this file's existing responsive-duplication
  // pattern — see the mobile/desktop avatar split) so the delete action
  // isn't duplicated.
  const menuActions: HighlightMenuAction[] = [
    {
      label:
        currentSlide.media_type === "video"
          ? "Delete this video"
          : "Delete this photo",
      onSelect: () => setShowConfirmDelete(true),
      destructive: true,
    },
  ];

  // While the 3-dot menu or the confirm dialog is open, the underlying
  // media's own gestures must be inert — otherwise a tap meant to dismiss
  // the menu (which only covers a small area) can also land on the
  // full-height prev/next tap zones underneath and immediately navigate, or
  // on desktop toggle pause again right after the hold-effect resumed it.
  const isMenuOrDialogOpen = showMenu || showConfirmDelete;

  return (
    <div className="fixed left-0 top-0 z-30 w-full h-dvh bg-black flex items-center justify-center overflow-hidden">
      {/*
        Explicit stacking scale for this viewer (back to front):
        z-0 background blur < z-10 foreground media < z-20 header/controls < z-40 modals.
        Note: the foreground media wrapper below has no `position` class, but
        it's a direct child of this flex container, so per the CSS Flexbox
        spec its `z-index` still applies as if it were `position: relative`
        — it is NOT exempt from stacking just because it looks unpositioned.
        Header and media must never share a z-index, or whichever is later in
        the DOM (the media) wins ties and paints over the header/progress bars.
      */}
      {backgroundSrc && (
        <div
          key={currentSlide.id}
          className="absolute inset-0 overflow-hidden z-0"
        >
          <Image
            src={backgroundSrc}
            alt=""
            fill
            className="object-cover scale-110 blur-2xl opacity-60"
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>
      )}

      {/*
        `absolute` removes this from the parent flex container's layout, so
        the parent's `justify-center` (which already centers the media layer
        below) can't center this too — it falls back to its left-anchored
        static position instead. `left-1/2 -translate-x-1/2` is the standard
        fix for centering a fixed-width absolutely-positioned element.
        Desktop-only (`md:`) so mobile's existing left-anchored position is
        untouched.
      */}
      <div className="w-[95%] absolute top-5 md:left-1/2 md:-translate-x-1/2 flex flex-col md:flex-row items-center gap-3 z-20">
        {/* Desktop-only back arrow, its own column beside the header block
            (unchanged from before — kept as a separate element rather than
            reused inside the mobile row below so desktop's layout/position
            is untouched). */}
        <button
          type="button"
          onClick={onClose}
          className="hidden md:block shrink-0"
        >
          <IoMdArrowBack className="text-xl text-white" />
        </button>

        {/*
          `md:mx-auto` centers this column in the space left over after the
          back-arrow button above (its flex sibling) — without it, the
          column (only 60% width at `lg`) sits flush-left right after the
          arrow, so even though the outer header box is now centered on the
          viewport, the actual visible content (progress bar, avatar,
          username, menu) still hugs its left side.
        */}
        <div className="w-full md:w-[90%] lg:w-[60%] space-y-2 md:space-y-3 md:mx-auto">
          <ul className="flex items-center gap-1">
            {progressBars.map((item, index) => (
              <li
                key={item.id}
                className="w-full flex items-center h-1 rounded-full bg-white bg-opacity-50 shadow-md"
              >
                {index === currentIndex ? (
                  <span
                    className="bg-white h-1 animate-story"
                    style={{
                      animationPlayState:
                        isPaused || isLoading ? "paused" : "running",
                      animationDuration: currentAnimationDuration,
                    }}
                  />
                ) : (
                  <span
                    className={`bg-white h-1 ${
                      index < currentIndex ? "w-full" : "w-0"
                    }`}
                  />
                )}
              </li>
            ))}
          </ul>

          {/* Mobile WhatsApp-Status-style header row: back arrow, avatar,
              username and the 3-dot menu all on one line, right below the
              progress bars. Temporarily hidden (opacity only, still laid
              out) while a long-press hold is active, and restored the
              instant the finger lifts. */}
          <div
            className={`w-full flex md:hidden items-center gap-2 transition-opacity duration-150 ${
              isLongPressHolding
                ? "opacity-0 pointer-events-none"
                : "opacity-100"
            }`}
          >
            <button type="button" onClick={onClose} className="shrink-0">
              <IoMdArrowBack className="text-xl text-white" />
            </button>

            <UserAvatar avatarUrl={avatarUrl} width={50} height={50} />

            <p className="text-white text-sm font-bold flex-1 min-w-0 truncate">
              {username}
            </p>

            {isOwner && (
              <HighlightMenuButton
                isOpen={showMenu}
                onOpenChange={setShowMenu}
                actions={menuActions}
                menuRef={mobileMenuRef}
                excludeRefs={[desktopMenuRef]}
              />
            )}
          </div>

          {/* Desktop user profile row (unchanged layout) */}
          <div className="hidden md:flex w-full justify-between items-center">
            <div className="flex items-start gap-2">
              <UserAvatar avatarUrl={avatarUrl} width={50} height={50} />

              <div className="text-white text-sm font-bold">
                <p>{username}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Indicator for pause and play */}
              <div className="flex">
                {isPaused ? (
                  <SlControlPause className="text-white text-2xl" />
                ) : (
                  <IoPlay className="text-white text-2xl" />
                )}
              </div>

              {isOwner && (
                <HighlightMenuButton
                  isOpen={showMenu}
                  onOpenChange={setShowMenu}
                  actions={menuActions}
                  menuRef={desktopMenuRef}
                  excludeRefs={[mobileMenuRef]}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Foreground media layer (z-10 — see stacking scale comment above) */}
      <div className="flex items-center h-full z-10">
        {/* Desktop button for viewing previous slide */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePreviousSlide();
          }}
          className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute left-1 top-1/2 -translate-y-1/2"
        >
          <IoChevronBack className="text-2xl text-white" />
        </button>

        {/* Desktop button for viewing next slide */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleNextSlide();
          }}
          className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute right-1 top-1/2 -translate-y-1/2"
        >
          <IoChevronForward className="text-2xl text-white" />
        </button>

        {/* Media */}
        <div
          className="h-full flex items-center justify-center relative"
          onClick={isMenuOrDialogOpen ? undefined : guardedMediaClick}
          onKeyDown={isMenuOrDialogOpen ? undefined : handleMediaKeyDown}
          onContextMenu={(e) => e.preventDefault()}
          style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
          tabIndex={0}
          // biome-ignore lint/a11y/useSemanticElements: <explanation>
          role="button"
        >
          {/*
            Gated while the menu/dialog is open: these tap zones span the
            full height of the media area, underneath the header, so a tap
            meant to dismiss the (small) menu can also land here — without
            this guard it would both close the menu (via click-outside) and
            navigate to the next/previous slide from the very same tap.
          */}
          {/* Mobile gesture for left tap zone: tap = previous slide, hold = pause, swipe = highlight/close */}
          <div
            className="absolute touch-manipulation select-none left-0 top-0 w-1/2 h-full lg:hidden"
            onTouchStart={isMenuOrDialogOpen ? undefined : handleTouchStart}
            onTouchMove={isMenuOrDialogOpen ? undefined : handleTouchMove}
            onTouchEnd={
              isMenuOrDialogOpen ? undefined : (e) => guardedTouchEnd(e, "prev")
            }
          />

          {/* Mobile gesture for right tap zone: tap = next slide, hold = pause, swipe = highlight/close */}
          <div
            className="absolute touch-manipulation select-none right-0 top-0 w-1/2 h-full lg:hidden"
            onTouchStart={isMenuOrDialogOpen ? undefined : handleTouchStart}
            onTouchMove={isMenuOrDialogOpen ? undefined : handleTouchMove}
            onTouchEnd={
              isMenuOrDialogOpen ? undefined : (e) => guardedTouchEnd(e, "next")
            }
          />

          {/*
            The media element is always mounted (never conditionally
            excluded) so the browser actually fetches it and its load events
            can fire — it's only visually hidden via opacity while loading.
            Conditionally rendering it only after `isLoading` is false would
            deadlock: an element that never exists can never signal it's ready.
          */}
          {currentSlide.media_type === "image" ? (
            <Image
              src={currentSlide.media_url}
              alt="Highlight"
              width={700}
              height={700}
              draggable={false}
              className={`object-contain cursor-pointer max-w-full max-h-full transition-opacity duration-200 ${
                isLoading ? "opacity-0" : "opacity-100"
              }`}
              onLoad={() => {
                setIsLoading(false);
              }}
            />
          ) : (
            <video
              ref={videoRef}
              src={currentSlide.media_url}
              className={`max-w-full max-h-full transition-opacity duration-200 ${
                isLoading ? "opacity-0" : "opacity-100"
              }`}
              controls={false}
              playsInline
              autoPlay
              onEnded={handleNextSlide}
              onLoadedMetadata={handleVideoLoadedMetadata}
              onCanPlay={handleVideoCanPlay}
              muted={false}
            />
          )}

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-4 border-white border-t-transparent animate-spin rounded-full w-12 h-12" />
            </div>
          )}
        </div>
      </div>

      {showConfirmDelete && (
        <ConfirmDeleteModal
          message={`Are you sure you want to delete this ${
            currentSlide.media_type === "video" ? "video" : "photo"
          }?`}
          isLoading={isDeleting}
          onConfirm={handleDeleteSlide}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}

      {deleteError && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 bg-black text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {deleteError}
        </div>
      )}
    </div>
  );
}
