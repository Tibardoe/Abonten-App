import type { EditableMedia } from "@/features/profile/useHighlightComposer";
import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import { uuidv4 } from "@/lib/uuid";
import type { ContentKind } from "@abonten/types/contentType";
import { useCallback, useRef, useState } from "react";

export type PublishDetails = {
  kind: ContentKind;
  publisherPlaceId: string | null;
  caption: string;
  eventId: string | null;
  placeId: string | null;
  allowComments: boolean;
  allowDownload: boolean;
  publish: boolean;
};

export type PublishState =
  | { phase: "idle" }
  | { phase: "uploading"; index: number; total: number; fraction: number }
  | { phase: "saving" }
  | { phase: "done" }
  | { phase: "error"; message: string };

/**
 * Upload each picked item straight to Cloudinary, register it (the server
 * re-reads the asset and enforces size, format and length), then create and
 * publish the post in one call. Media already registered in an earlier,
 * failed attempt is reused, and the request id makes the create idempotent,
 * so "Try again" never duplicates anything.
 */
export function useContentPublish() {
  const [state, setState] = useState<PublishState>({ phase: "idle" });
  const registered = useRef(new Map<string, string>());
  const requestId = useRef(uuidv4());

  const reset = useCallback(() => {
    registered.current.clear();
    requestId.current = uuidv4();
    setState({ phase: "idle" });
  }, []);

  const run = useCallback(
    async (items: EditableMedia[], details: PublishDetails) => {
      try {
        const mediaIds: string[] = [];
        for (let i = 0; i < items.length; i += 1) {
          const item = items[i];
          const existing = registered.current.get(item.id);
          if (existing) {
            mediaIds.push(existing);
            continue;
          }
          setState({
            phase: "uploading",
            index: i,
            total: items.length,
            fraction: 0,
          });
          const isVideo = item.type === "video";
          const upload = await uploadToCloudinary(item.uri, "content", {
            video: isVideo,
            onProgress: (fraction) =>
              setState({
                phase: "uploading",
                index: i,
                total: items.length,
                fraction,
              }),
          });
          const trimmed =
            isVideo &&
            item.durationSeconds !== null &&
            item.startSeconds !== null &&
            item.endSeconds !== null &&
            (item.startSeconds > 0.05 ||
              item.endSeconds < item.durationSeconds - 0.05);
          const res = await api.content.registerMedia({
            kind: details.kind,
            publicId: upload.publicId,
            resourceType: isVideo ? "video" : "image",
            version: upload.version,
            trimStartSeconds: trimmed
              ? (item.startSeconds ?? undefined)
              : undefined,
            trimEndSeconds: trimmed
              ? (item.endSeconds ?? undefined)
              : undefined,
          });
          if (res.status !== 200 || !res.data) {
            throw new Error(res.message ?? "We couldn't process that file.");
          }
          registered.current.set(item.id, res.data.id);
          mediaIds.push(res.data.id);
        }

        setState({ phase: "saving" });
        const res = await api.content.createPost({
          kind: details.kind,
          publisher: details.publisherPlaceId
            ? { kind: "place", placeId: details.publisherPlaceId }
            : { kind: "organizer", placeId: null },
          mediaIds,
          caption: details.caption.trim() || null,
          hashtags: [],
          eventId: details.eventId,
          placeId: details.placeId,
          allowComments: details.allowComments,
          allowDownload:
            details.kind === "spotlight" ? details.allowDownload : false,
          rightsAcknowledged: true,
          publish: details.publish,
          clientRequestId: requestId.current,
        });
        if (res.status !== 200) {
          throw new Error(res.message ?? "Couldn't create your post.");
        }
        setState({ phase: "done" });
        return true;
      } catch (error) {
        setState({
          phase: "error",
          message:
            error instanceof Error && error.message
              ? error.message
              : "Something went wrong. Please try again.",
        });
        return false;
      }
    },
    [],
  );

  return { state, run, reset };
}
