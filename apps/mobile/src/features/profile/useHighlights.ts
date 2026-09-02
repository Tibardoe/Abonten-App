import { api } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinaryUpload";
import { supabase } from "@/lib/supabase";
import { uuidv4 } from "@/lib/uuid";
import type {
  HighlightGroup,
  HighlightRow,
} from "@abonten/types/highlightType";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Native echo of the web `getUserHighlights` action + `UserHighlights`
// component, plus creator tooling (upload / delete) mirroring
// `useHighlightUpload` + `deleteHighlight` / `deleteHighlightSlide`.
//
// The `highlight` table has public-read RLS (`highlight_public_select`
// `USING (true)`) and owner-scoped write (`highlight_owner_insert` /
// `_delete` = `auth.uid() = user_id`), so the read and the create insert
// run straight from the client. Delete goes through `/api/mobile/highlights`
// so the orphaned Cloudinary asset gets destroyed with the server secret
// (the shared `highlightDeleteCore.ts`, also used by the web actions).

async function fetchHighlights(userId: string): Promise<HighlightGroup[]> {
  const { data, error } = await supabase
    .from("highlight")
    .select("*")
    .eq("user_id", userId)
    // Safety cap, matching the web action.
    .limit(200);
  if (error) throw error;

  const rows = (data ?? []) as HighlightRow[];
  const byGroup = new Map<string, HighlightRow[]>();
  for (const row of rows) {
    const list = byGroup.get(row.group_id) ?? [];
    list.push(row);
    byGroup.set(row.group_id, list);
  }

  const groups = [...byGroup.values()].map((slides) =>
    [...slides].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  );
  groups.sort((a, b) => {
    const aLatest = a[a.length - 1]?.created_at ?? "";
    const bLatest = b[b.length - 1]?.created_at ?? "";
    return bLatest.localeCompare(aLatest);
  });
  return groups;
}

export function useHighlights(userId: string | undefined) {
  return useQuery({
    queryKey: ["profile", "highlights", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: () => fetchHighlights(userId as string),
  });
}

// Client-side caps mirroring useMediaSelection.ts (the web highlight picker).
export const MAX_HIGHLIGHT_VIDEO_BYTES = 90 * 1024 * 1024;
export const MAX_HIGHLIGHT_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_HIGHLIGHT_VIDEO_SECONDS = 60;
// Trim-segment bounds (mirrors MAX_TRIM_SEGMENT_DURATION / MIN_TRIM_DURATION
// in the web useMediaSelection.ts).
export const MAX_TRIM_SEGMENT_SECONDS = MAX_HIGHLIGHT_VIDEO_SECONDS;
export const MIN_TRIM_SEGMENT_SECONDS = 1;

export type HighlightMediaPick = {
  uri: string;
  type: "image" | "video";
  /** seconds, videos only */
  durationSeconds?: number | null;
  /** trim window start, seconds — videos only, set by the editor */
  startSeconds?: number | null;
  /** trim window end, seconds — videos only, set by the editor */
  endSeconds?: number | null;
};

// Cloudinary derives a poster frame for any video on first request; build
// the URL locally from the public_id/version the upload returned (no extra
// round trip), same idea as uploadHighlight.ts's `cloudinary.url(...)`.
function videoThumbnailUrl(publicId: string, version: number): string {
  const cloud = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  return `https://res.cloudinary.com/${cloud}/video/upload/w_300,h_300,c_thumb/v${version}/${publicId}.jpg`;
}

// A delivery URL for a sub-range of an already-uploaded video, with the trim
// baked in as Cloudinary `so_`/`eo_` offsets. The raw clip is always
// uploaded unchanged (no client-side re-encode); playback is what respects
// the trim — the exact approach `resolveVideoDelivery` takes in the web
// `uploadHighlight.ts` action.
function trimmedVideoUrl(
  publicId: string,
  version: number,
  start: number,
  end: number,
  ext: string | undefined,
): string {
  const cloud = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const suffix = ext ? `.${ext}` : "";
  return `https://res.cloudinary.com/${cloud}/video/upload/so_${start},eo_${end}/v${version}/${publicId}${suffix}`;
}

// Port of `resolveVideoDelivery` from apps/web/src/actions/uploadHighlight.ts.
// Returns the URL + duration to store: the trimmed segment when the editor
// set a valid strict sub-range, otherwise the untrimmed clip.
function resolveTrimmedDelivery(
  up: { url: string; publicId: string; version: number },
  item: HighlightMediaPick,
  durationSeconds: number | null,
): { mediaUrl: string; durationSeconds: number | null } {
  const fallback = { mediaUrl: up.url, durationSeconds };

  const start = item.startSeconds;
  const end = item.endSeconds;

  const trimIsValid =
    typeof start === "number" &&
    typeof end === "number" &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end > start &&
    (typeof durationSeconds !== "number" || end <= durationSeconds + 0.5);

  if (!trimIsValid) return fallback;

  const isFullLength =
    (start as number) <= 0.05 &&
    typeof durationSeconds === "number" &&
    (end as number) >= durationSeconds - 0.05;

  if (isFullLength) return fallback;

  const ext = up.url.split(/[?#]/)[0]?.split(".").pop();

  return {
    mediaUrl: trimmedVideoUrl(
      up.publicId,
      up.version,
      start as number,
      end as number,
      ext,
    ),
    durationSeconds: (end as number) - (start as number),
  };
}

export function useUploadHighlights(
  userId: string | undefined,
  opts?: { onProgress?: (fraction: number) => void },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (media: HighlightMediaPick[]) => {
      if (!userId) throw new Error("Not signed in");
      if (media.length === 0) throw new Error("Nothing selected");

      // One batch = one "story". Sequential upload, same as the web hook
      // (mobile-first, bandwidth-constrained; a batch is usually 1–2 clips).
      // Overall progress = completed files + the current file's fraction,
      // over the file count.
      const groupId = uuidv4();
      const total = media.length;
      opts?.onProgress?.(0);
      for (let i = 0; i < media.length; i++) {
        const item = media[i];
        const isVideo = item.type === "video";
        const up = await uploadToCloudinary(item.uri, "highlight", {
          video: isVideo,
          onProgress: (f) => opts?.onProgress?.((i + f) / total),
        });
        const rawDuration = isVideo
          ? (up.duration ?? item.durationSeconds ?? null)
          : null;
        // Bake any editor trim into the delivery URL (Cloudinary so_/eo_),
        // exactly like the web action — the uploaded bytes stay untouched.
        const { mediaUrl, durationSeconds } = isVideo
          ? resolveTrimmedDelivery(up, item, rawDuration)
          : { mediaUrl: up.url, durationSeconds: null };
        const { error } = await supabase.from("highlight").insert({
          user_id: userId,
          media_url: mediaUrl,
          media_type: up.resourceType,
          thumbnail_url: isVideo
            ? videoThumbnailUrl(up.publicId, up.version)
            : null,
          media_duration: durationSeconds,
          group_id: groupId,
          public_id: up.publicId,
        });
        if (error) throw error;
        opts?.onProgress?.((i + 1) / total);
      }
      return { groupId, count: media.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", "highlights", userId] });
    },
  });
}

export function useDeleteHighlightGroup(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groupId: string) => {
      const res = await api.highlights.deleteGroup(groupId);
      if (res.status !== 200) throw new Error(res.message);
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", "highlights", userId] });
    },
  });
}

export function useDeleteHighlightSlide(userId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slideId: string) => {
      const res = await api.highlights.deleteSlide(slideId);
      if (res.status !== 200) throw new Error(res.message);
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile", "highlights", userId] });
    },
  });
}
