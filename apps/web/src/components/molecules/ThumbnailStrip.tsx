"use client";

import formatDuration from "@/utils/formatVideoDuration";
import type { MediaItem } from "@abonten/types/mediaItemType";
import { Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

type ThumbnailStripTypes = {
  mediaItems: MediaItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
};

// A held press (not an instant one) starts a reorder drag, so a quick swipe
// across the strip still scrolls it natively instead of grabbing a tile.
const LONG_PRESS_MS = 300;
// Movement past this during the long-press window cancels it -- it reads as
// the start of a scroll/tap, not a hold.
const MOVE_CANCEL_THRESHOLD = 10;

export default function ThumbnailStrip({
  mediaItems,
  activeId,
  onSelect,
  onDelete,
  onReorder,
}: ThumbnailStripTypes) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);

  const pressOrigin = useRef({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(false);
  const suppressNextClickRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    id: string,
  ) => {
    if (mediaItems.length < 2) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    pressOrigin.current = { x: event.clientX, y: event.clientY };
    draggingRef.current = false;

    const pointerId = event.pointerId;
    const target = event.currentTarget;

    clearLongPressTimer();
    longPressTimer.current = setTimeout(() => {
      draggingRef.current = true;
      setDragId(id);
      setDragOffsetX(0);
      try {
        target.setPointerCapture(pointerId);
      } catch {
        // Pointer may already be released -- nothing to do.
      }
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
    id: string,
  ) => {
    if (draggingRef.current && dragId === id) {
      // Now actually dragging -- take over from native scroll.
      event.preventDefault();
      setDragOffsetX(event.clientX - pressOrigin.current.x);
      return;
    }

    if (longPressTimer.current) {
      const dx = Math.abs(event.clientX - pressOrigin.current.x);
      const dy = Math.abs(event.clientY - pressOrigin.current.y);
      if (dx > MOVE_CANCEL_THRESHOLD || dy > MOVE_CANCEL_THRESHOLD) {
        // Reads as the start of a scroll, not a hold -- let it through.
        clearLongPressTimer();
      }
    }
  };

  const finishDrag = (id: string) => {
    const draggedRect = itemRefs.current.get(id)?.getBoundingClientRect();

    if (draggedRect) {
      const draggedCenter =
        draggedRect.left + draggedRect.width / 2 + dragOffsetX;

      let closestId = id;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const item of mediaItems) {
        if (item.id === id) continue;
        const rect = itemRefs.current.get(item.id)?.getBoundingClientRect();
        if (!rect) continue;

        const distance = Math.abs(rect.left + rect.width / 2 - draggedCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestId = item.id;
        }
      }

      if (closestId !== id) {
        onReorder(id, closestId);
      }
    }

    setDragId(null);
    setDragOffsetX(0);
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
    id: string,
  ) => {
    clearLongPressTimer();

    if (draggingRef.current && dragId === id) {
      finishDrag(id);
      suppressNextClickRef.current = true;
    }

    draggingRef.current = false;
  };

  const handleClick = (id: string) => {
    // A drag ends with a pointerup over the same button, which the browser
    // still turns into a click -- swallow that one so it doesn't also
    // toggle selection of the tile that was just moved.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    onSelect(id);
  };

  return (
    <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
      <div className="flex gap-2 overflow-x-auto py-2">
        {mediaItems.map((item, index) => {
          const isActive = activeId === item.id;
          const isDragging = dragId === item.id;

          return (
            <div
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el);
                else itemRefs.current.delete(item.id);
              }}
              onPointerDown={(e) => handlePointerDown(e, item.id)}
              onPointerMove={(e) => handlePointerMove(e, item.id)}
              onPointerUp={(e) => handlePointerUp(e, item.id)}
              onPointerCancel={(e) => handlePointerUp(e, item.id)}
              style={
                isDragging
                  ? {
                      transform: `translateX(${dragOffsetX}px) scale(1.08)`,
                      touchAction: "none",
                      zIndex: 10,
                    }
                  : undefined
              }
              className={`relative w-16 h-16 rounded-md overflow-hidden transition-[opacity,box-shadow] ${
                isActive ? "ring-2 ring-black" : "opacity-70"
              } ${isDragging ? "opacity-100 shadow-lg" : ""}`}
            >
              <button
                type="button"
                onClick={() => handleClick(item.id)}
                aria-label={`View ${item.type} ${index + 1} of ${mediaItems.length}`}
                aria-current={isActive}
                className="w-full h-full"
              >
                {item.type === "image" ? (
                  <Image src={item.url} alt="" fill className="object-cover" />
                ) : (
                  <>
                    <Image
                      src={item.thumbnail || "/fallback-thumbnail.png"}
                      alt=""
                      fill
                      className="object-cover"
                    />

                    <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
                      {item.startTime !== undefined &&
                      item.endTime !== undefined
                        ? formatDuration(item.endTime - item.startTime)
                        : formatDuration(item.duration || 0)}
                    </div>
                  </>
                )}
              </button>

              {isActive && (
                // Corner badge, not centered over the tile -- centering it
                // would overlap the exact spot a user taps to reselect an
                // already-active thumbnail, risking an accidental delete.
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  aria-label={`Remove ${item.type} ${index + 1}`}
                  className="absolute -top-1.5 -right-1.5 h-7 w-7 flex items-center justify-center bg-black text-white rounded-full ring-2 ring-background"
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
