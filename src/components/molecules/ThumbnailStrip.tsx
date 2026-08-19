import type { MediaItem } from "@/types/mediaItemType";
import formatDuration from "@/utils/formatVideoDuration";
import { Trash2Icon } from "lucide-react";
import Image from "next/image";

type ThumbnailStripTypes = {
  mediaItems: MediaItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function ThumbnailStrip({
  mediaItems,
  activeId,
  onSelect,
  onDelete,
}: ThumbnailStripTypes) {
  return (
    <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
      <div className="flex gap-2 overflow-x-auto py-2">
        {mediaItems.map((item, index) => {
          const isActive = activeId === item.id;

          return (
            <div
              key={item.id}
              className={`relative w-16 h-16 rounded-md overflow-hidden ${
                isActive ? "ring-2 ring-black" : "opacity-70"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(item.id)}
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
