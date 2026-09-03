"use client";

import { addPlacePhoto } from "@/actions/addPlacePhoto";
import getPlacePhotoUploadSignature from "@/actions/getPlacePhotoUploadSignature";
import { uploadToCloudinary } from "@/utils/uploadToCloudinary";
import { isImageFile } from "@abonten/core/isImageFile";
import { MAX_EVENT_FLYER_SIZE_BYTES } from "@abonten/core/uploadLimits";
import { useCallback, useState } from "react";

export type GalleryUploadItem = {
  id: string;
  fileName: string;
  status: "signing" | "uploading" | "saving" | "success" | "error";
  progress: number;
  errorMessage: string | null;
};

function patch(
  setItems: React.Dispatch<React.SetStateAction<GalleryUploadItem[]>>,
  id: string,
  changes: Partial<GalleryUploadItem>,
) {
  setItems((prev) =>
    prev.map((item) => (item.id === id ? { ...item, ...changes } : item)),
  );
}

const SUCCESS_DISMISS_MS = 2000;

// Drives the direct-to-Cloudinary upload pipeline for a place's photo
// gallery (sign -> upload -> save metadata), mirroring
// useHighlightUpload.ts's shape -- independent per-file progress/error
// state, so one failed photo never hides another's success. Simpler than
// useHighlightUpload.ts since the gallery is images-only (no video
// trim/duration handling needed).
export function usePlaceGalleryUpload(placeId: string, onUploaded: () => void) {
  const [items, setItems] = useState<GalleryUploadItem[]>([]);

  const runItem = useCallback(
    async (id: string, file: File) => {
      patch(setItems, id, {
        status: "signing",
        progress: 0,
        errorMessage: null,
      });

      const signatureResponse = await getPlacePhotoUploadSignature();

      if (signatureResponse.status !== 200 || !signatureResponse.data) {
        patch(setItems, id, {
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
        maxFileSizeBytes,
      } = signatureResponse.data;

      patch(setItems, id, { status: "uploading" });

      let cloudinaryResult: Awaited<
        ReturnType<typeof uploadToCloudinary>["promise"]
      >;

      try {
        const { promise } = uploadToCloudinary({
          file,
          cloudName: cloudName as string,
          apiKey: apiKey as string,
          timestamp,
          signature,
          folder,
          allowedFormats,
          maxFileSizeBytes,
          resourceType: "image",
          onProgress: (percent) => patch(setItems, id, { progress: percent }),
        });

        cloudinaryResult = await promise;
      } catch (error) {
        patch(setItems, id, {
          status: "error",
          errorMessage:
            error instanceof Error
              ? error.message
              : "We couldn't upload this photo. Please try again.",
        });
        return;
      }

      patch(setItems, id, { status: "saving", progress: 100 });

      try {
        const saveResponse = await addPlacePhoto(
          placeId,
          cloudinaryResult.public_id,
          String(cloudinaryResult.version),
        );

        if (saveResponse.status !== 200) {
          patch(setItems, id, {
            status: "error",
            errorMessage: saveResponse.message ?? "Failed to save photo.",
          });
          return;
        }

        onUploaded();
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
              : "We couldn't save this photo. Please try again.",
        });
      }
    },
    [placeId, onUploaded],
  );

  const start = useCallback(
    (files: File[]) => {
      const validFiles = files.filter((file) => {
        if (!isImageFile(file)) return false;
        if (file.size > MAX_EVENT_FLYER_SIZE_BYTES) return false;
        return true;
      });

      const seeded: GalleryUploadItem[] = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        fileName: file.name,
        status: "signing",
        progress: 0,
        errorMessage: null,
      }));

      setItems((prev) => [...prev, ...seeded]);

      (async () => {
        for (let i = 0; i < seeded.length; i++) {
          await runItem(seeded[i].id, validFiles[i]);
        }
      })();
    },
    [runItem],
  );

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const isUploading = items.some(
    (item) => item.status !== "success" && item.status !== "error",
  );

  return { items, start, dismiss, isUploading };
}
