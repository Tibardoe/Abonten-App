"use client";

import { uploadToCloudinary } from "@/utils/uploadToCloudinary";
import { isImageFile } from "@abonten/core/isImageFile";
import {
  MAX_REVIEW_PHOTOS,
  MAX_REVIEW_PHOTO_SIZE_BYTES,
} from "@abonten/core/uploadLimits";
import { useCallback, useEffect, useRef, useState } from "react";

export type ReviewPhotoUploadItem = {
  id: string;
  fileName: string;
  previewUrl: string;
  status: "signing" | "uploading" | "success" | "error";
  progress: number;
  errorMessage: string | null;
  publicId: string | null;
  version: string | null;
};

type UploadSignatureResponse = {
  status: number;
  message?: string;
  data?: {
    timestamp: number;
    signature: string;
    apiKey?: string;
    cloudName?: string;
    folder: string;
    allowedFormats: string;
  };
};

// Shared by the place-review and event-review submission modals -- one
// review media upload pipeline, not two. Uploads start immediately on
// selection (sign -> direct-to-Cloudinary upload), the same "upload on
// select, not on submit" UX as ManagePlacePhotosSection.tsx/
// usePlaceGalleryUpload.ts, but with no "save metadata" step here: the
// review row this photo will belong to doesn't exist yet, so only the
// resulting {publicId, version} pairs are held in memory and handed to
// postPlaceReview.ts/postEventReview.ts once the review itself is
// submitted (see insertReviewPhotos.ts).
export function useReviewPhotoUpload(
  getUploadSignature: () => Promise<UploadSignatureResponse>,
  // Number of slots already spoken for by photos outside this hook's own
  // `items` -- specifically, an edit-mode review's existing (not-yet-removed)
  // photos, which count toward MAX_REVIEW_PHOTOS but aren't tracked here.
  // Defaults to 0 for the create-review case, where nothing precedes this
  // hook's own uploads.
  reservedSlots = 0,
) {
  const [items, setItems] = useState<ReviewPhotoUploadItem[]>([]);
  const objectUrls = useRef<Set<string>>(new Set());
  const effectiveMax = Math.max(MAX_REVIEW_PHOTOS - reservedSlots, 0);

  // Object URLs are only released explicitly (on remove/reset) or here on
  // unmount -- never revoked mid-render, so a still-visible preview never
  // goes blank out from under the user.
  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<ReviewPhotoUploadItem>) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...changes } : item)),
      );
    },
    [],
  );

  const runItem = useCallback(
    async (id: string, file: File) => {
      patch(id, { status: "signing", progress: 0, errorMessage: null });

      const signatureResponse = await getUploadSignature();

      if (signatureResponse.status !== 200 || !signatureResponse.data) {
        patch(id, {
          status: "error",
          errorMessage: signatureResponse.message ?? "Failed to start upload.",
        });
        return;
      }

      const {
        timestamp,
        signature,
        apiKey,
        cloudName,
        folder,
        allowedFormats,
      } = signatureResponse.data;

      patch(id, { status: "uploading" });

      try {
        const { promise } = uploadToCloudinary({
          file,
          cloudName: cloudName as string,
          apiKey: apiKey as string,
          timestamp,
          signature,
          folder,
          allowedFormats,
          resourceType: "image",
          onProgress: (percent) => patch(id, { progress: percent }),
        });

        const result = await promise;

        patch(id, {
          status: "success",
          progress: 100,
          publicId: result.public_id,
          version: String(result.version),
        });
      } catch (error) {
        patch(id, {
          status: "error",
          errorMessage:
            error instanceof Error
              ? error.message
              : "We couldn't upload this photo. Please try again.",
        });
      }
    },
    [getUploadSignature, patch],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const remainingSlots = effectiveMax - items.length;
      if (remainingSlots <= 0) return;

      const validFiles = files
        .filter(
          (file) =>
            isImageFile(file) && file.size <= MAX_REVIEW_PHOTO_SIZE_BYTES,
        )
        .slice(0, remainingSlots);

      const seeded: ReviewPhotoUploadItem[] = validFiles.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        objectUrls.current.add(previewUrl);

        return {
          id: crypto.randomUUID(),
          fileName: file.name,
          previewUrl,
          status: "signing",
          progress: 0,
          errorMessage: null,
          publicId: null,
          version: null,
        };
      });

      setItems((prev) => [...prev, ...seeded]);

      (async () => {
        for (let i = 0; i < seeded.length; i++) {
          await runItem(seeded[i].id, validFiles[i]);
        }
      })();
    },
    [items.length, effectiveMax, runItem],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        objectUrls.current.delete(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const reset = useCallback(() => {
    setItems((prev) => {
      for (const item of prev) {
        URL.revokeObjectURL(item.previewUrl);
        objectUrls.current.delete(item.previewUrl);
      }
      return [];
    });
  }, []);

  const isUploading = items.some(
    (item) => item.status === "signing" || item.status === "uploading",
  );

  const uploadedPhotos = items
    .filter(
      (item) => item.status === "success" && item.publicId && item.version,
    )
    .map((item) => ({
      publicId: item.publicId as string,
      version: item.version as string,
    }));

  return {
    items,
    addFiles,
    remove,
    reset,
    isUploading,
    uploadedPhotos,
    atLimit: items.length >= effectiveMax,
  };
}
