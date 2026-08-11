"use client";

import { deleteHighlightSlide } from "@/actions/deleteHighlightSlide";
import HighlightMenuButton from "@/components/atoms/HighlightMenuButton";
import UserAvatar from "@/components/atoms/UserAvatar";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import { useHighlightViewer } from "@/hooks/useHighlightViewer";
import type { HighlightGroup } from "@/types/highlightType";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useState } from "react";
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

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    currentGroup,
    currentIndex,
    currentSlide,
    progressBars,
    isPaused,
    isLoading,
    setIsLoading,
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
  } = useHighlightViewer({ groups, initialGroupIndex, onClose });

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

      <div className="w-[95%] absolute top-5 flex flex-col-reverse md:flex-row items-center gap-3 z-20">
        {/* Mobile story tracker bar and user profile */}
        <div className="self-start flex items-center gap-2">
          <button type="button" onClick={onClose}>
            <IoMdArrowBack className="text-xl text-white" />
          </button>

          <div className="flex items-start gap-2 md:hidden">
            <UserAvatar avatarUrl={avatarUrl} width={50} height={50} />

            <div className="text-white text-sm font-bold">
              <p>{username}</p>
            </div>
          </div>
        </div>

        <div className="w-full md:w-[90%] lg:w-[60%] md:space-y-3 mx-auto">
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

          {/* Desktop user profile */}
          <div className="w-full flex justify-between items-center">
            <div className="items-start gap-2 hidden md:flex">
              <UserAvatar avatarUrl={avatarUrl} width={50} height={50} />

              <div className="text-white text-sm font-bold">
                <p>{username}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Indicator for pause and play */}
              <div className="hidden md:flex">
                {isPaused ? (
                  <SlControlPause className="text-white text-2xl" />
                ) : (
                  <IoPlay className="text-white text-2xl" />
                )}
              </div>

              {isOwner && (
                <HighlightMenuButton
                  actions={[
                    {
                      label:
                        currentSlide.media_type === "video"
                          ? "Delete this video"
                          : "Delete this photo",
                      onSelect: () => setShowConfirmDelete(true),
                      destructive: true,
                    },
                  ]}
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
          onClick={handleMediaClick}
          onKeyDown={handleMediaKeyDown}
          tabIndex={0}
          // biome-ignore lint/a11y/useSemanticElements: <explanation>
          role="button"
        >
          {/* Mobile gesture for left tap zone: tap = previous slide, hold = pause, swipe = highlight/close */}
          <div
            className="absolute touch-manipulation select-none left-0 top-0 w-1/2 h-full lg:hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={(e) => handleTouchEnd(e, "prev")}
          />

          {/* Mobile gesture for right tap zone: tap = next slide, hold = pause, swipe = highlight/close */}
          <div
            className="absolute touch-manipulation select-none right-0 top-0 w-1/2 h-full lg:hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={(e) => handleTouchEnd(e, "next")}
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
