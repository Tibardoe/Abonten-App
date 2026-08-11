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
  onLongPress: (buttonEl: HTMLButtonElement | null) => void;
  onContextMenu: (
    position: MenuPosition | null,
    buttonEl: HTMLButtonElement | null,
  ) => void;
};

function HighlightAvatar({
  thumbnailUrl,
  isOwner,
  onOpen,
  onLongPress,
  onContextMenu,
}: HighlightAvatarProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Some mobile browsers (Android Chrome in particular) fire a native
  // `contextmenu` event as part of recognizing a long-press gesture, using
  // essentially the same ~500ms threshold as our own useLongPress JS timer
  // below. When the native gesture wins that race, the browser dispatches a
  // real touchend as part of handing off to contextmenu — which cancels our
  // JS timer (useLongPress.onTouchEnd unconditionally clears it) — so
  // *this* contextmenu event ends up being the only thing that can still
  // open the menu. It must therefore always be allowed to open the menu
  // (calling openMenuForGroup twice, once from each path, is harmless and
  // idempotent). What it must NOT do is trust this event's clientX/clientY
  // for positioning — those come from a touch-emulated mouse event and are
  // unreliable — so this flag is used only to pick a safe anchored position
  // for touch-originated opens instead of the (possibly bad) cursor
  // coordinates; real desktop right-clicks still position at the cursor.
  const touchActiveRef = useRef(false);
  const touchActiveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const longPress = useLongPress({
    onTap: onOpen,
    onLongPress: () => onLongPress(buttonRef.current),
  });

  return (
    <button
      ref={buttonRef}
      type="button"
      className="m-1 rounded-full border-4 border-mint flex items-center justify-center"
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
      onClick={isOwner ? longPress.onClick : onOpen}
      onTouchStart={
        isOwner
          ? (e) => {
              touchActiveRef.current = true;
              if (touchActiveTimeoutRef.current) {
                clearTimeout(touchActiveTimeoutRef.current);
                touchActiveTimeoutRef.current = null;
              }
              longPress.onTouchStart(e);
            }
          : undefined
      }
      onTouchMove={isOwner ? longPress.onTouchMove : undefined}
      onTouchEnd={
        isOwner
          ? () => {
              longPress.onTouchEnd();
              // contextmenu (if it fires at all) follows touchend almost
              // immediately as part of the same gesture — keep the guard
              // up briefly rather than clearing it synchronously here.
              touchActiveTimeoutRef.current = setTimeout(() => {
                touchActiveRef.current = false;
                touchActiveTimeoutRef.current = null;
              }, 500);
            }
          : undefined
      }
      onContextMenu={(e) => {
        // Always block the native "Save/Share image" menu, for every
        // viewer. Always allowed to open the app's own menu too (see the
        // touchActiveRef comment above for why touch-originated opens
        // can't be skipped) — only the position differs by origin.
        e.preventDefault();
        if (isOwner) {
          onContextMenu(
            touchActiveRef.current ? null : { x: e.clientX, y: e.clientY },
            buttonRef.current,
          );
        }
      }}
    >
      <Image
        src={thumbnailUrl}
        alt="Highlight"
        width={70}
        height={70}
        draggable={false}
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

  // The avatar button that triggered the currently-open menu. A long-press
  // opens the menu while the finger is still down, so the release's
  // synthetic mousedown targets that button (a sibling of the menu, not a
  // DOM descendant) — without excluding it, useClickOutside sees that as
  // "outside" and closes the menu within the very same gesture.
  const activeAvatarButtonRef = useRef<HTMLButtonElement | null>(null);

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

  const openMenuForGroup = (
    index: number,
    position?: MenuPosition | null,
    buttonEl?: HTMLButtonElement | null,
  ) => {
    activeAvatarButtonRef.current = buttonEl ?? null;
    setMenuGroupIndex(index);
    setMenuPosition(position ?? null);
  };

  const closeMenu = () => {
    setMenuGroupIndex(null);
    setMenuPosition(null);
    activeAvatarButtonRef.current = null;
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
                    onLongPress={(buttonEl) =>
                      openMenuForGroup(index, undefined, buttonEl)
                    }
                    onContextMenu={(position, buttonEl) =>
                      openMenuForGroup(index, position, buttonEl)
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
                      excludeRefs={[activeAvatarButtonRef]}
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
