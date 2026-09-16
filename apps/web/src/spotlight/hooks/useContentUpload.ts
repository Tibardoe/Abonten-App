"use client";

import getContentUploadSignature from "@/actions/content/getContentUploadSignature";
import { registerContentMedia } from "@/actions/content/registerContentMedia";
import { uploadToCloudinary } from "@/utils/uploadToCloudinary";
import type { ContentKind, ContentMediaItem } from "@abonten/types/contentType";
import { useCallback, useRef, useState } from "react";
import { dataOf, messageOf } from "../lib/result";

export type ComposerFile = {
  id: string;
  file: File;
  type: "image" | "video";
  previewUrl: string;
  durationSeconds: number | null;
  trimStart: number;
  trimEnd: number | null;
  status: "idle" | "uploading" | "registering" | "done" | "error";
  progress: number;
  error: string | null;
  media: ContentMediaItem | null;
};

/**
 * Sign → upload straight to Cloudinary → register. Registration re-reads the
 * asset from Cloudinary on the server, so nothing the browser claims about
 * size, format or length is trusted. Each file keeps its own progress and
 * error so one failure never loses the others.
 */
export function useContentUpload(kind: ContentKind) {
  const [files, setFiles] = useState<ComposerFile[]>([]);
  const xhrs = useRef(new Map<string, XMLHttpRequest>());

  const patch = useCallback((id: string, changes: Partial<ComposerFile>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...changes } : f)),
    );
  }, []);

  const add = useCallback(async (picked: File[]) => {
    const prepared = await Promise.all(
      picked.map(async (file): Promise<ComposerFile> => {
        const type = file.type.startsWith("video/") ? "video" : "image";
        const previewUrl = URL.createObjectURL(file);
        let durationSeconds: number | null = null;
        if (type === "video") {
          durationSeconds = await new Promise<number | null>((resolve) => {
            const v = document.createElement("video");
            v.preload = "metadata";
            v.onloadedmetadata = () =>
              resolve(Number.isFinite(v.duration) ? v.duration : null);
            v.onerror = () => resolve(null);
            v.src = previewUrl;
          });
        }
        return {
          id: crypto.randomUUID(),
          file,
          type,
          previewUrl,
          durationSeconds,
          trimStart: 0,
          trimEnd: null,
          status: "idle",
          progress: 0,
          error: null,
          media: null,
        };
      }),
    );
    setFiles((prev) => [...prev, ...prepared]);
    return prepared;
  }, []);

  const remove = useCallback((id: string) => {
    xhrs.current.get(id)?.abort();
    xhrs.current.delete(id);
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const reset = useCallback(() => {
    for (const xhr of xhrs.current.values()) xhr.abort();
    xhrs.current.clear();
    setFiles((prev) => {
      for (const f of prev) URL.revokeObjectURL(f.previewUrl);
      return [];
    });
  }, []);

  const uploadOne = useCallback(
    async (item: ComposerFile): Promise<ContentMediaItem | null> => {
      if (item.media) return item.media;
      patch(item.id, { status: "uploading", progress: 0, error: null });

      const signature = await getContentUploadSignature();
      if (signature.status !== 200 || !signature.data) {
        patch(item.id, {
          status: "error",
          error: signature.message ?? "Couldn't start the upload.",
        });
        return null;
      }
      const s = signature.data;

      let uploaded: Awaited<ReturnType<typeof uploadToCloudinary>["promise"]>;
      try {
        const { promise, xhr } = uploadToCloudinary({
          file: item.file,
          cloudName: s.cloudName as string,
          apiKey: s.apiKey as string,
          timestamp: s.timestamp,
          signature: s.signature,
          folder: s.folder,
          allowedFormats: s.allowedFormats,
          resourceType: item.type,
          onProgress: (progress) => patch(item.id, { progress }),
        });
        xhrs.current.set(item.id, xhr);
        uploaded = await promise;
      } catch (error) {
        if (error instanceof Error && error.message === "Upload cancelled.") {
          return null;
        }
        patch(item.id, {
          status: "error",
          error: error instanceof Error ? error.message : "Upload failed.",
        });
        return null;
      } finally {
        xhrs.current.delete(item.id);
      }

      patch(item.id, { status: "registering", progress: 100 });
      const trimmed =
        item.type === "video" &&
        (item.trimStart > 0 || (item.trimEnd !== null && item.trimEnd > 0));
      const res = await registerContentMedia({
        kind,
        publicId: uploaded.public_id,
        resourceType: item.type,
        version: uploaded.version,
        trimStartSeconds: trimmed ? item.trimStart : undefined,
        trimEndSeconds: trimmed
          ? (item.trimEnd ?? item.durationSeconds ?? undefined)
          : undefined,
      });
      const media = dataOf(res);
      if (!media) {
        patch(item.id, {
          status: "error",
          error: messageOf(res, "We couldn't process this file."),
        });
        return null;
      }
      patch(item.id, { status: "done", media });
      return media;
    },
    [kind, patch],
  );

  /** Uploads every file not yet uploaded, in order. Null if any failed. */
  const uploadAll = useCallback(
    async (current: ComposerFile[]): Promise<ContentMediaItem[] | null> => {
      const out: ContentMediaItem[] = [];
      for (const item of current) {
        const media = await uploadOne(item);
        if (!media) return null;
        out.push(media);
      }
      return out;
    },
    [uploadOne],
  );

  return { files, add, remove, reset, patch, uploadAll };
}
