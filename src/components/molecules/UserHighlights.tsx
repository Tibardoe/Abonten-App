"use client";

import { deleteHighlight } from "@/actions/deleteHighlight";
import getUserHighlight from "@/actions/getUserHighlights";
import HighlightMenu from "@/components/molecules/HighlightMenu";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import HighlightViewer from "@/components/organisms/HighlightViewer";
import { useLongPress } from "@/hooks/useLongPress";
import type { HighlightGroup } from "@/types/highlightType";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";

type HighlightProps = {
  avatarUrl: string;
  username: string;
  isOwner: boolean;
};

type MenuPosition = { x: number; y: number };

type HighlightAvatarProps = {
  thumbnailUrl: string;
  isOwner: boolean;
  onOpen: () => void;
  onLongPress: () => void;
  onContextMenu: (position: MenuPosition) => void;
};

function HighlightAvatar({
  thumbnailUrl,
  isOwner,
  onOpen,
  onLongPress,
  onContextMenu,
}: HighlightAvatarProps) {
  const longPress = useLongPress({
    onTap: onOpen,
    onLongPress,
  });

  return (
    <button
      type="button"
      className="m-1 rounded-full border-4 border-mint flex items-center justify-center"
      onClick={isOwner ? longPress.onClick : onOpen}
      onTouchStart={isOwner ? longPress.onTouchStart : undefined}
      onTouchMove={isOwner ? longPress.onTouchMove : undefined}
      onTouchEnd={isOwner ? longPress.onTouchEnd : undefined}
      onContextMenu={
        isOwner
          ? (e) => {
              e.preventDefault();
              onContextMenu({ x: e.clientX, y: e.clientY });
            }
          : undefined
      }
    >
      <Image
        src={thumbnailUrl}
        alt="Highlight"
        width={70}
        height={70}
        className="object-cover w-[70px] h-[70px] rounded-full m-[2px] border border-black"
      />
    </button>
  );
}

export default function UserHighlights({
  avatarUrl,
  username,
  isOwner,
}: HighlightProps) {
  const queryClient = useQueryClient();

  const [openGroupIndex, setOpenGroupIndex] = useState<number | null>(null);

  const [highlightError, setHighlightError] = useState<string | null>(null);

  const [showLeftArrow, setShowLeftArrow] = useState(false);

  const [showRightArrow, setShowRightArrow] = useState(false);

  const [menuGroupIndex, setMenuGroupIndex] = useState<number | null>(null);

  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Captured at the moment "Delete Highlight" is selected, independently of
  // menuGroupIndex — the menu (and menuGroupIndex) closes immediately on
  // selection, before the confirm dialog's "Yes" is ever clicked, so
  // handleDeleteHighlight must not depend on menuGroupIndex still being set.
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<
    string | null
  >(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLUListElement>(null);

  const { data: highlights } = useQuery({
    queryKey: ["highlights", username],
    queryFn: async () => {
      const response = await getUserHighlight(username);

      if (response.status !== 200 && response.message) {
        setHighlightError(response.message);
      }

      return response.data as HighlightGroup[] | undefined;
    },
  });

  const scroll = (direction: "left" | "right") => {
    const container = scrollRef.current;

    if (!container) return;

    const scrollAmount = container.clientWidth * 0.75;

    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const checkScrollPosition = useCallback(() => {
    const container = scrollRef.current;

    if (container) {
      const { scrollLeft, scrollWidth, clientWidth } = container;

      setShowLeftArrow(scrollLeft > 0);

      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
    }
  }, []);

  useEffect(() => {
    const currentRef = scrollRef.current;
    if (currentRef) {
      currentRef.addEventListener("scroll", checkScrollPosition);
      checkScrollPosition(); // Initial check
    }
    return () => {
      if (currentRef) {
        currentRef.removeEventListener("scroll", checkScrollPosition);
      }
    };
  }, [checkScrollPosition]);

  const openMenuForGroup = (index: number, position?: MenuPosition) => {
    setMenuGroupIndex(index);
    setMenuPosition(position ?? null);
  };

  const closeMenu = () => {
    setMenuGroupIndex(null);
    setMenuPosition(null);
  };

  const handleDeleteHighlight = async () => {
    if (!pendingDeleteGroupId) return;

    setIsDeleting(true);
    const response = await deleteHighlight(pendingDeleteGroupId);
    setIsDeleting(false);

    if (response.status !== 200) {
      setDeleteError(response.message ?? "Failed to delete highlight.");
      setTimeout(() => setDeleteError(null), 3000);
      return;
    }

    setShowConfirmDelete(false);
    if (
      openGroupIndex !== null &&
      highlights?.[openGroupIndex]?.[0]?.group_id === pendingDeleteGroupId
    ) {
      setOpenGroupIndex(null);
    }
    setPendingDeleteGroupId(null);
    queryClient.invalidateQueries({ queryKey: ["highlights", username] });
  };

  if (highlightError) {
    return <div className="text-red-500">Error: {highlightError}</div>;
  }

  return (
    highlights && (
      <>
        <div>
          {/* Desktop scroll left */}
          {showLeftArrow && (
            <button
              type="button"
              onClick={() => scroll("left")}
              className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute left-1 top-1/2 -translate-y-1/2"
            >
              <IoChevronBack className="text-2xl text-white" />
            </button>
          )}

          {/* Desktop scroll right */}
          {showRightArrow && (
            <button
              type="button"
              onClick={() => scroll("right")}
              className="bg-black hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute right-1 top-1/2 -translate-y-1/2"
            >
              <IoChevronForward className="text-2xl text-white" />
            </button>
          )}

          {/* List of highlights */}
          <ul
            ref={scrollRef}
            className="flex items-center overflow-x-auto scrollbar-hide"
          >
            {highlights.map((group, index) => {
              const lastPost = group.length - 1;
              const lastItem = group[lastPost];
              const thumbnailUrl =
                lastItem.media_type === "video"
                  ? (lastItem.thumbnail_url ?? lastItem.media_url)
                  : lastItem.media_url;

              return (
                <li key={lastItem.group_id} className="shrink-0 relative">
                  <HighlightAvatar
                    thumbnailUrl={thumbnailUrl}
                    isOwner={isOwner}
                    onOpen={() => setOpenGroupIndex(index)}
                    onLongPress={() => openMenuForGroup(index)}
                    onContextMenu={(position) =>
                      openMenuForGroup(index, position)
                    }
                  />

                  {menuGroupIndex === index && (
                    <HighlightMenu
                      actions={[
                        {
                          label: "Delete Highlight",
                          destructive: true,
                          onSelect: () => {
                            setPendingDeleteGroupId(lastItem.group_id);
                            setShowConfirmDelete(true);
                          },
                        },
                      ]}
                      onClose={closeMenu}
                      style={
                        menuPosition
                          ? {
                              position: "fixed",
                              top: menuPosition.y,
                              left: menuPosition.x,
                            }
                          : undefined
                      }
                      className={
                        menuPosition
                          ? ""
                          : "absolute left-1/2 -translate-x-1/2 top-full mt-2"
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {openGroupIndex !== null && (
          <HighlightViewer
            groups={highlights}
            initialGroupIndex={openGroupIndex}
            avatarUrl={avatarUrl}
            username={username}
            isOwner={isOwner}
            onClose={() => setOpenGroupIndex(null)}
          />
        )}

        {showConfirmDelete && (
          <ConfirmDeleteModal
            message="Are you sure you want to delete this highlight? This will delete all photos and videos in it."
            isLoading={isDeleting}
            onConfirm={handleDeleteHighlight}
            onCancel={() => {
              setShowConfirmDelete(false);
              setPendingDeleteGroupId(null);
            }}
          />
        )}

        {deleteError && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 bg-black text-white text-sm px-4 py-2 rounded-lg shadow-lg">
            {deleteError}
          </div>
        )}
      </>
    )
  );
}
