import type { MediaItem } from "@/types/mediaItemType";
import formatDuration from "@/utils/formatVideoDuration";
import { Trash2Icon } from "lucide-react";
import Image from "next/image";

type ThumbnailStripTypes = {
  mediaItems: MediaItem[];
  currentIndex: number;
  setCurrentIndex: (index: number) => void;
  handleDelete: (index: number) => void;
};

export default function ThumbnailStrip({
  mediaItems,
  currentIndex,
  setCurrentIndex,
  handleDelete,
}: ThumbnailStripTypes) {
  return (
    <div className="absolute bottom-4 left-0 right-0 flex justify-center px-4">
      <div className="flex gap-2 overflow-x-auto py-2">
        {mediaItems.map((item, index) => (
          <div
            key={item.url} // Using item.url as key for better stability if order changes
            className={`relative w-16 h-16 rounded-md overflow-hidden ${
              currentIndex === index ? "ring-2 ring-black" : "opacity-70"
            }`}
          >
            <button
              type="button"
              onClick={() => setCurrentIndex(index)}
              className="w-full h-full"
            >
              {item.type === "image" ? (
                <Image
                  src={item.url}
                  alt="Thumbnail"
                  fill
                  className="object-cover"
                />
              ) : (
                <>
                  <Image
                    src={item.thumbnail || "/fallback-thumbnail.png"}
                    alt="Video thumbnail"
                    fill
                    className="object-cover"
                  />

                  <div className="absolute bottom-1 right-1 bg-black bg-opacity-50 text-white text-xs px-1 rounded">
                    {/* Display trimmed duration for thumbnails */}
                    {item.startTime !== undefined && item.endTime !== undefined
                      ? formatDuration(item.endTime - item.startTime)
                      : formatDuration(item.duration || 0)}
                  </div>
                </>
              )}
            </button>

            {currentIndex === index && (
              <button
                type="button"
                onClick={() => handleDelete(index)}
                className="absolute top-[50%] right-[50%] bg-black bg-opacity-50 text-white rounded-md transform translate-x-1/2 -translate-y-1/2"
              >
                <Trash2Icon className="text-5xl" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
