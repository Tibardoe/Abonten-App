"use client";

import getHighlightUploadSignature from "@/actions/getHighlightUploadSignature";
import uploadHighlight from "@/actions/uploadHighlight";
import type { HighlightUploadItem } from "@/types/highlightUploadType";
import type { MediaItem } from "@/types/mediaItemType";
import { uploadToCloudinary } from "@/utils/uploadToCloudinary";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

const SUCCESS_DISMISS_MS = 2500;

function patch(
  setItems: React.Dispatch<React.SetStateAction<HighlightUploadItem[]>>,
  id: string,
  changes: Partial<HighlightUploadItem>,
) {
  setItems((prev) =>
    prev.map((item) => (item.id === id ? { ...item, ...changes } : item)),
  );
}

// Drives the direct-to-Cloudinary upload pipeline per file (sign -> upload
// -> save metadata) and owns independent per-file progress/success/error
// state, so one file failing never hides another's success and a failed
// file can be retried without re-uploading the rest of the batch.
export function useHighlightUpload(username: string) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<HighlightUploadItem[]>([]);

  // Media items are kept alongside their upload item so a retry doesn't
  // need the caller to still be holding onto the original selection.
  const mediaItemsRef = useRef<Map<string, MediaItem>>(new Map());

  const runItem = useCallback(
    async (id: string, mediaItem: MediaItem, groupId: string) => {
      patch(setItems, id, {
        status: "signing",
        progress: 0,
        errorMessage: null,
      });

      const signatureResponse = await getHighlightUploadSignature();

      if (signatureResponse.status !== 200 || !signatureResponse.data) {
        patch(setItems, id, {
          status: "error",
          errorMessage: signatureResponse.message ?? "Failed to start upload.",
        });
        return;
      }

      const { timestamp, signature, apiKey, cloudName, folder } =
        signatureResponse.data;

      patch(setItems, id, { status: "uploading" });

      let cloudinaryResult: Awaited<
        ReturnType<typeof uploadToCloudinary>["promise"]
      >;

      try {
        const { promise } = uploadToCloudinary({
          file: mediaItem.file,
          cloudName: cloudName as string,
          apiKey: apiKey as string,
          timestamp,
          signature,
          folder,
          resourceType: mediaItem.type,
          onProgress: (percent) => patch(setItems, id, { progress: percent }),
        });

        cloudinaryResult = await promise;
      } catch (error) {
        patch(setItems, id, {
          status: "error",
          errorMessage:
            error instanceof Error
              ? error.message
              : "We couldn't upload this highlight. Please try again.",
        });
        return;
      }

      patch(setItems, id, { status: "saving", progress: 100 });

      try {
        const saveResponse = await uploadHighlight(
          [
            {
              publicId: cloudinaryResult.public_id,
              secureUrl: cloudinaryResult.secure_url,
              version: cloudinaryResult.version,
              resourceType: cloudinaryResult.resource_type,
              bytes: cloudinaryResult.bytes,
              durationSeconds: cloudinaryResult.duration ?? null,
              trimStartSeconds:
                mediaItem.type === "video"
                  ? (mediaItem.startTime ?? null)
                  : null,
              trimEndSeconds:
                mediaItem.type === "video" ? (mediaItem.endTime ?? null) : null,
            },
          ],
          groupId,
        );

        // Invalidate regardless of status: a partial failure can still mean
        // this slide uploaded successfully server-side.
        queryClient.invalidateQueries({ queryKey: ["highlights", username] });

        if (saveResponse.status !== 200) {
          patch(setItems, id, {
            status: "error",
            errorMessage: saveResponse.message ?? "Failed to save highlight.",
          });
          return;
        }

        patch(setItems, id, { status: "success", progress: 100 });
        setTimeout(() => {
          setItems((prev) => prev.filter((item) => item.id !== id));
        }, SUCCESS_DISMISS_MS);
      } catch (error) {
        patch(setItems, id, {
          status: "error",
          errorMessage:
            error instanceof Error
              ? error.message
              : "We couldn't save this highlight. Please try again.",
        });
      }
    },
    [queryClient, username],
  );

  const start = useCallback(
    (mediaItems: MediaItem[]) => {
      const groupId = crypto.randomUUID();

      const seeded: HighlightUploadItem[] = mediaItems.map((mediaItem) => {
        const id = crypto.randomUUID();
        mediaItemsRef.current.set(id, mediaItem);
        return {
          id,
          groupId,
          mediaItem,
          status: "signing",
          progress: 0,
          errorMessage: null,
        };
      });

      setItems((prev) => [...prev, ...seeded]);

      // Sequential, not concurrent: this is a mobile-first, bandwidth-
      // constrained product, and a batch is typically 1-2 clips -- running
      // them in parallel over one uplink would only make both slower and
      // more failure-prone with no real benefit.
      (async () => {
        for (const item of seeded) {
          await runItem(item.id, item.mediaItem, item.groupId);
        }
      })();
    },
    [runItem],
  );

  const retry = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      const mediaItem = mediaItemsRef.current.get(id);
      if (!item || !mediaItem) return;
      runItem(id, mediaItem, item.groupId);
    },
    [items, runItem],
  );

  const dismiss = useCallback((id: string) => {
    mediaItemsRef.current.delete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const isUploading = items.some(
    (item) => item.status !== "success" && item.status !== "error",
  );

  return { items, start, retry, dismiss, isUploading };
}
