import { generateVideoThumbnail } from "@/utils/generateVideoThumbnail";
import { generateVideoThumbnailStrip } from "@/utils/generateVideoThumbnailStrip";
import { logger } from "@/utils/logger";
import type { MediaItem } from "@abonten/types/mediaItemType";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "./useToast";

// Cloudinary's free-tier non-chunked upload ceiling is 100MB; 90MB leaves
// headroom so users see our own clear error instead of a raw Cloudinary
// rejection near the edge. Re-checked server-side in uploadHighlight.ts.
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_VIDEO_SIZE_BYTES = 90 * 1024 * 1024;
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

// Max allowed duration for uploaded videos, and max duration of the
// *trimmed segment* -- kept equal so trimming can never produce something
// that would itself need re-trimming on upload.
export const MAX_VIDEO_UPLOAD_DURATION = 60;
export const MAX_TRIM_SEGMENT_DURATION = 60;
export const MIN_TRIM_DURATION = 1;

type TimelineStatus = "idle" | "loading" | "ready" | "error";

function getVideoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.src = url;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.src = "";
    };

    video.onloadedmetadata = () => {
      resolve(video.duration);
      cleanup();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to load video metadata."));
    };
  });
}

// Single source of truth for the Highlight creation flow's media selection:
// mediaItems + activeId, with everything else (current index, current
// media, trim range) derived or stored directly on the item it belongs to.
// All CRUD is id-based -- never array index -- so delete/select/trim can't
// desync from a stale position.
export function useMediaSelection() {
  const toast = useToast();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [timelineStatus, setTimelineStatus] = useState<
    Record<string, TimelineStatus>
  >({});

  const mediaItemsRef = useRef<MediaItem[]>([]);
  useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  // Revoke every remaining object URL on unmount (draft discarded, modal
  // closed, etc).
  useEffect(() => {
    return () => {
      for (const item of mediaItemsRef.current) {
        try {
          URL.revokeObjectURL(item.url);
        } catch {
          // Already revoked -- nothing to do.
        }
      }
    };
  }, []);

  const currentIndex = mediaItems.findIndex((item) => item.id === activeId);
  const currentMedia = currentIndex >= 0 ? mediaItems[currentIndex] : null;

  const selectFiles = useCallback(
    async (files: FileList): Promise<boolean> => {
      const newMediaItems: MediaItem[] = [];
      const filesToProcess = Array.from(files);

      for (const file of filesToProcess) {
        const isVideo = file.type.startsWith("video");
        const isImage = file.type.startsWith("image");

        if (!isVideo && !isImage) {
          toast.error(`"${file.name}" isn't a supported file type.`);
          continue;
        }

        if (isVideo && !ALLOWED_VIDEO_TYPES.includes(file.type)) {
          toast.error(
            `"${file.name}" isn't a supported video format. Please use MP4, MOV, or WebM.`,
          );
          continue;
        }

        if (isImage && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
          toast.error(`"${file.name}" isn't a supported image format.`);
          continue;
        }

        if (isVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
          toast.error(
            `"${file.name}" is too large. Maximum video size is ${
              MAX_VIDEO_SIZE_BYTES / (1024 * 1024)
            }MB.`,
          );
          continue;
        }

        if (isImage && file.size > MAX_IMAGE_SIZE_BYTES) {
          toast.error(
            `"${file.name}" is too large. Maximum image size is ${
              MAX_IMAGE_SIZE_BYTES / (1024 * 1024)
            }MB.`,
          );
          continue;
        }

        const url = URL.createObjectURL(file);
        const id = crypto.randomUUID();

        if (isVideo) {
          let duration = 0;
          let thumbnail = "";

          try {
            duration = await getVideoDuration(url);

            if (Number.isNaN(duration)) {
              throw new Error("Invalid video duration");
            }

            thumbnail = await generateVideoThumbnail(file);
          } catch (e) {
            logger.error("Skipping video due to metadata error:", file.name, e);
            URL.revokeObjectURL(url);
            continue;
          }

          if (duration > MAX_VIDEO_UPLOAD_DURATION) {
            toast.warning(
              `Video "${file.name}" is longer than ${MAX_VIDEO_UPLOAD_DURATION} seconds and will be trimmed to the first ${MAX_VIDEO_UPLOAD_DURATION} seconds.`,
            );
            newMediaItems.push({
              id,
              url,
              file,
              type: "video",
              duration,
              startTime: 0,
              endTime: MAX_VIDEO_UPLOAD_DURATION,
              thumbnail,
            });
          } else {
            newMediaItems.push({
              id,
              url,
              file,
              type: "video",
              duration,
              startTime: 0,
              endTime: duration,
              thumbnail,
            });
          }
        } else {
          newMediaItems.push({ id, url, file, type: "image" });
        }
      }

      if (newMediaItems.length === 0) {
        return false;
      }

      // Each file-picker invocation replaces the whole selection (there's
      // no "add more" entry point today), so the previous batch's URLs are
      // safe to revoke here.
      for (const item of mediaItemsRef.current) {
        URL.revokeObjectURL(item.url);
      }

      setMediaItems(newMediaItems);
      setTimelineStatus({});
      setActiveId(newMediaItems[0].id);
      return true;
    },
    [toast],
  );

  const deleteMedia = useCallback((id: string) => {
    setMediaItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index === -1) return prev;

      URL.revokeObjectURL(prev[index].url);
      const updated = prev.filter((item) => item.id !== id);

      setActiveId((prevActiveId) => {
        if (updated.length === 0) return null;
        if (prevActiveId !== id) return prevActiveId;
        // The deleted item was active: land on whichever item is now at
        // the same position, or the new last item if it was the tail.
        const nextIndex = Math.min(index, updated.length - 1);
        return updated[nextIndex].id;
      });

      return updated;
    });
  }, []);

  const replaceCropped = useCallback((id: string, croppedFile: File) => {
    setMediaItems((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      if (index === -1 || prev[index].type !== "image") return prev;

      const oldUrl = prev[index].url;
      const newUrl = URL.createObjectURL(croppedFile);
      URL.revokeObjectURL(oldUrl);

      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        url: newUrl,
        file: croppedFile,
        type: "image",
      };
      return updated;
    });
  }, []);

  // Directional navigation by offset (prev/next chevrons, swipe) -- sets
  // the slide-transition direction and the target id atomically so
  // MediaStage always animates the way the user actually navigated.
  const goToOffset = useCallback(
    (offset: 1 | -1) => {
      setDirection(offset);
      setActiveId((prevId) => {
        const prevIndex = mediaItems.findIndex((m) => m.id === prevId);
        if (prevIndex === -1) return prevId;
        const nextIndex = prevIndex + offset;
        if (nextIndex < 0 || nextIndex >= mediaItems.length) return prevId;
        return mediaItems[nextIndex].id;
      });
    },
    [mediaItems],
  );

  // Directional jump to an arbitrary id (thumbnail strip tap) -- derives
  // direction from relative position so the transition still reads as
  // "moving toward" the tapped thumbnail.
  const goToId = useCallback(
    (id: string) => {
      setActiveId((prevId) => {
        if (prevId === id) return prevId;
        const prevIndex = mediaItems.findIndex((m) => m.id === prevId);
        const nextIndex = mediaItems.findIndex((m) => m.id === id);
        if (prevIndex !== -1 && nextIndex !== -1) {
          setDirection(nextIndex > prevIndex ? 1 : -1);
        }
        return id;
      });
    },
    [mediaItems],
  );

  // Moves the item `fromId` to sit at wherever `toId` currently is.
  const reorderMedia = useCallback((fromId: string, toId: string) => {
    setMediaItems((prev) => {
      const fromIndex = prev.findIndex((item) => item.id === fromId);
      const toIndex = prev.findIndex((item) => item.id === toId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
        return prev;
      }

      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
  }, []);

  const updateTrim = useCallback(
    (id: string, startTime: number, endTime: number) => {
      setMediaItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, startTime, endTime } : item,
        ),
      );
    },
    [],
  );

  const ensureTimelineThumbnails = useCallback((id: string) => {
    setTimelineStatus((prevStatus) => {
      if (prevStatus[id]) return prevStatus; // already idle->loading->done once

      const item = mediaItemsRef.current.find((m) => m.id === id);
      if (!item || item.type !== "video") return prevStatus;

      generateVideoThumbnailStrip(item.file)
        .then((frames) => {
          setMediaItems((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, timelineThumbnails: frames } : m,
            ),
          );
          setTimelineStatus((s) => ({
            ...s,
            [id]: frames.length > 0 ? "ready" : "error",
          }));
        })
        .catch(() => {
          setTimelineStatus((s) => ({ ...s, [id]: "error" }));
        });

      return { ...prevStatus, [id]: "loading" };
    });
  }, []);

  return {
    mediaItems,
    activeId,
    direction,
    currentIndex,
    currentMedia,
    timelineStatus,
    selectFiles,
    deleteMedia,
    replaceCropped,
    reorderMedia,
    updateTrim,
    ensureTimelineThumbnails,
    goToOffset,
    goToId,
  };
}
