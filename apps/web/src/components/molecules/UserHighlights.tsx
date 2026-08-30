"use client";

import { deleteHighlight } from "@/actions/deleteHighlight";
import getUserHighlight from "@/actions/getUserHighlights";
import HighlightMenu from "@/components/molecules/HighlightMenu";
import ConfirmDeleteModal from "@/components/organisms/ConfirmDeleteModal";
import HighlightViewer from "@/components/organisms/HighlightViewer";
import { useLongPress } from "@/hooks/useLongPress";
import HighlightsRowSkeleton from "@/userAccount/molecules/HighlightsRowSkeleton";
import type { HighlightGroup } from "@abonten/types/highlightType";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
        className="object-cover w-[70px] h-[70px] rounded-full m-[2px] border border-border"
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

  // Set only for touch-originated opens (see openMenuForGroup) — a snapshot
  // of the pressed avatar's own on-screen rect, taken because touch-event
  // coordinates are unreliable (see HighlightAvatar's onContextMenu
  // comment). Used to compute a viewport-fixed position below/above the
  // avatar, the same way menuPosition already does for desktop's
  // cursor-based open — see the useLayoutEffect below.
  const [menuAnchorRect, setMenuAnchorRect] = useState<DOMRect | null>(null);

  // The menu's own root element, so its real rendered size can be measured
  // once mounted (needed to decide whether it fits below the avatar or must
  // flip above, and to clamp it horizontally within the viewport).
  const anchoredMenuRef = useRef<HTMLDivElement | null>(null);

  const [anchoredMenuStyle, setAnchoredMenuStyle] =
    useState<CSSProperties | null>(null);

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

  const highlightsQueryKey = ["highlights", username];

  const { data: highlights, isLoading } = useQuery({
    queryKey: highlightsQueryKey,
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
    // No cursor position means this open is touch-originated (see
    // HighlightAvatar's onContextMenu) — anchor to the avatar's own
    // measured rect instead, so the menu can be viewport-fixed like
    // desktop's is rather than falling back to a position that's
    // constrained by the scrollable Highlights list.
    setAnchoredMenuStyle(null);
    setMenuAnchorRect(
      !position && buttonEl ? buttonEl.getBoundingClientRect() : null,
    );
  };

  const closeMenu = () => {
    setMenuGroupIndex(null);
    setMenuPosition(null);
    setMenuAnchorRect(null);
    setAnchoredMenuStyle(null);
    activeAvatarButtonRef.current = null;
  };

  // Runs synchronously after the menu mounts (with menuAnchorRect set but
  // anchoredMenuStyle still null, so it renders once — invisibly clipped by
  // the list, same as before — purely to be measurable) and before the
  // browser paints, so the corrected fixed position is what the user
  // actually sees; there's no visible flash of the wrong position.
  useLayoutEffect(() => {
    if (!menuAnchorRect) return;

    const GAP = 8;
    const VIEWPORT_MARGIN = 8;
    const menuEl = anchoredMenuRef.current;
    const menuHeight = menuEl?.offsetHeight ?? 0;
    const menuWidth = menuEl?.offsetWidth ?? 192; // matches HighlightMenu's min-w-48

    const spaceBelow = window.innerHeight - menuAnchorRect.bottom;
    const fitsBelow = spaceBelow >= menuHeight + GAP + VIEWPORT_MARGIN;

    const top = fitsBelow
      ? menuAnchorRect.bottom + GAP
      : Math.max(VIEWPORT_MARGIN, menuAnchorRect.top - GAP - menuHeight);

    const idealLeft =
      menuAnchorRect.left + menuAnchorRect.width / 2 - menuWidth / 2;
    const left = Math.min(
      Math.max(idealLeft, VIEWPORT_MARGIN),
      window.innerWidth - menuWidth - VIEWPORT_MARGIN,
    );

    setAnchoredMenuStyle({ position: "fixed", top, left });
  }, [menuAnchorRect]);

  // Deleting your own highlight group is a user-confirmed, easily-reversible
  // action, so the group (and, if it was open, the viewer) closes the
  // instant the user confirms rather than waiting on the round trip; a
  // rejected delete puts the group back and explains why via the existing
  // deleteError toast below.
  const handleDeleteHighlight = async () => {
    if (!pendingDeleteGroupId) return;
    const groupId = pendingDeleteGroupId;

    setShowConfirmDelete(false);
    setPendingDeleteGroupId(null);
    if (
      openGroupIndex !== null &&
      highlights?.[openGroupIndex]?.[0]?.group_id === groupId
    ) {
      setOpenGroupIndex(null);
    }

    await queryClient.cancelQueries({ queryKey: highlightsQueryKey });

    const previousHighlights =
      queryClient.getQueryData<HighlightGroup[]>(highlightsQueryKey);

    queryClient.setQueryData<HighlightGroup[]>(highlightsQueryKey, (old) =>
      old?.filter((group) => group[0]?.group_id !== groupId),
    );

    setIsDeleting(true);
    const response = await deleteHighlight(groupId);
    setIsDeleting(false);

    if (response.status !== 200) {
      if (previousHighlights) {
        queryClient.setQueryData(highlightsQueryKey, previousHighlights);
      }
      setDeleteError(response.message ?? "Failed to delete highlight.");
      setTimeout(() => setDeleteError(null), 3000);
    }

    queryClient.invalidateQueries({ queryKey: highlightsQueryKey });
  };

  if (highlightError) {
    return <div className="text-destructive">Error: {highlightError}</div>;
  }

  if (isLoading) {
    return <HighlightsRowSkeleton />;
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
              className="bg-popover hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute left-1 top-1/2 -translate-y-1/2"
            >
              <IoChevronBack className="text-2xl text-popover-foreground" />
            </button>
          )}

          {/* Desktop scroll right */}
          {showRightArrow && (
            <button
              type="button"
              onClick={() => scroll("right")}
              className="bg-popover hidden lg:flex items-center justify-center w-10 h-10 rounded-full shadow-md absolute right-1 top-1/2 -translate-y-1/2"
            >
              <IoChevronForward className="text-2xl text-popover-foreground" />
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
                      menuRef={menuAnchorRect ? anchoredMenuRef : undefined}
                      style={
                        menuPosition
                          ? {
                              position: "fixed",
                              top: menuPosition.y,
                              left: menuPosition.x,
                            }
                          : menuAnchorRect
                            ? (anchoredMenuStyle ?? {
                                position: "fixed",
                                top: menuAnchorRect.bottom + 8,
                                left: menuAnchorRect.left,
                                // Hidden until the layout effect above has
                                // measured this first render and computed
                                // the final, viewport-clamped position —
                                // avoids a visible flash at a provisional
                                // (possibly clipped or off-screen) spot.
                                visibility: "hidden",
                              })
                            : undefined
                      }
                      className={
                        menuPosition || menuAnchorRect
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
            title="Delete this highlight?"
            message="Are you sure you want to delete this highlight? This will delete all photos and videos in it."
            confirmLabel="Delete Highlight"
            loadingLabel="Deleting…"
            isLoading={isDeleting}
            onConfirm={handleDeleteHighlight}
            onCancel={() => {
              setShowConfirmDelete(false);
              setPendingDeleteGroupId(null);
            }}
          />
        )}

        {deleteError && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 bg-popover text-popover-foreground border border-border text-sm px-4 py-2 rounded-lg shadow-lg">
            {deleteError}
          </div>
        )}
      </>
    )
  );
}
